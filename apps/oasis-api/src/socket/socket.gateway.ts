import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit, WebSocketGateway } from '@nestjs/websockets';
import { IncomingMessage } from 'http';
import { Model } from 'mongoose';
import { Server, WebSocket } from 'ws';
import { AuthService } from '../components/auth/auth.service';
import { Member } from '../libs/dto/member/member';

/**
 * Oasis Space live chat.
 *
 * One shared public room. The client connects to `ws://host/?token=<jwt>`,
 * and the protocol the frontend already speaks is:
 *
 *   server → client   { event: 'info', totalClients, memberData, action }
 *                     { event: 'getMessages', list: [{ event, text, memberData }] }
 *                     { event: 'message', text, memberData }
 *   client → server   { event: 'message', data: '<text>' }
 *
 * Guests may connect and read; only an authenticated member can post, because
 * every stored message needs a real author.
 */

const HISTORY_LIMIT = 50;

interface ChatClient extends WebSocket {
	member?: Member;
}

/** what the frontend renders for a message author */
const publicMember = (member: any) => ({
	_id: member?._id,
	memberType: member?.memberType,
	memberNick: member?.memberNick,
	memberFullName: member?.memberFullName ?? null,
	memberImage: member?.memberImage ?? null,
});

@WebSocketGateway({ transports: ['websocket'], secure: false })
export class SocketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
	private logger: Logger = new Logger('SocketEventsGateway');
	private server!: Server;
	private clients = new Set<ChatClient>();

	constructor(
		@InjectModel('Message') private readonly messageModel: Model<any>,
		@InjectModel('Member') private readonly memberModel: Model<any>,
		private readonly authService: AuthService,
	) {}

	public afterInit(server: Server) {
		this.server = server;
		this.logger.log('Websocket server initialized');
	}

	/** token lives in the connection query string, not a header */
	private async resolveMember(req: IncomingMessage): Promise<Member | undefined> {
		try {
			const url = new URL(req.url ?? '', 'http://localhost');
			const token = url.searchParams.get('token');
			if (!token || token === 'null' || token === 'undefined') return undefined;
			const claims = await this.authService.verifyToken(token);
			// the JWT is a snapshot; re-read so a renamed/re-imaged member is current
			const fresh = await this.memberModel.findById(claims._id).exec();
			return (fresh ?? claims) as Member;
		} catch {
			return undefined; // unreadable token → connect as a guest
		}
	}

	private send(client: ChatClient, payload: unknown) {
		if (client.readyState === client.OPEN) client.send(JSON.stringify(payload));
	}

	private broadcast(payload: unknown) {
		for (const client of this.clients) this.send(client, payload);
	}

	private broadcastInfo(member: Member | undefined, action: 'joined' | 'left') {
		this.broadcast({
			event: 'info',
			totalClients: this.clients.size,
			memberData: member ? publicMember(member) : null,
			action,
		});
	}

	/** Send this client the backlog plus the current head-count. */
	private async sendState(client: ChatClient) {
		const history = await this.messageModel
			.find()
			.sort({ createdAt: -1 })
			.limit(HISTORY_LIMIT)
			.populate('memberId')
			.exec();

		this.send(client, {
			event: 'getMessages',
			list: history.reverse().map((doc: any) => ({
				event: 'message',
				text: doc.text,
				createdAt: doc.createdAt,
				memberData: doc.memberId ? publicMember(doc.memberId) : null,
			})),
		});
		this.send(client, {
			event: 'info',
			totalClients: this.clients.size,
			memberData: client.member ? publicMember(client.member) : null,
			action: 'sync',
		});
	}

	public async handleConnection(client: ChatClient, req: IncomingMessage) {
		this.clients.add(client);
		client.member = await this.resolveMember(req);

		// the joiner gets the backlog; everyone gets the new head-count
		await this.sendState(client);
		this.broadcastInfo(client.member, 'joined');
		this.logger.log(`Client connected — total: ${this.clients.size}`);

		client.on('message', (raw: Buffer) => void this.handleMessage(client, raw));
	}

	public handleDisconnect(client: ChatClient) {
		this.clients.delete(client);
		this.broadcastInfo(client.member, 'left');
		this.logger.log(`Client disconnected — total: ${this.clients.size}`);
	}

	/**
	 * Handled here rather than with @SubscribeMessage: the frontend sends
	 * `{ event, data }`, which is not the `{ event, data }` envelope shape the
	 * Nest ws adapter dispatches on for this project's payloads.
	 */
	private async handleMessage(client: ChatClient, raw: Buffer) {
		let text: string;
		try {
			const parsed = JSON.parse(raw.toString());
			// The socket opens at app boot but the chat UI mounts later, so the
			// join-time state can arrive before anything is listening. 'sync'
			// lets a late listener ask for it again.
			if (parsed?.event === 'sync') {
				await this.sendState(client);
				return;
			}
			if (parsed?.event !== 'message') return;
			text = String(parsed.data ?? '').trim();
		} catch {
			return;
		}

		if (!text) return;
		if (text.length > 1000) text = text.slice(0, 1000);
		// a message must have a real author — guests can read but not post
		if (!client.member?._id) {
			this.send(client, { event: 'info', totalClients: this.clients.size, memberData: null, action: 'unauthorized' });
			return;
		}

		const saved = await this.messageModel.create({ memberId: client.member._id, text });
		this.broadcast({
			event: 'message',
			text,
			createdAt: saved.createdAt,
			memberData: publicMember(client.member),
		});
	}
}

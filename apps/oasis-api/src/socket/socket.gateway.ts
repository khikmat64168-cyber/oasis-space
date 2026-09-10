import { Logger } from '@nestjs/common';
import { OnGatewayInit, SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import { Server } from 'node_modules/@types/ws/index.mjs';

@WebSocketGateway({ transports: ['websocket'], secure: false })
export class SocketGateway implements OnGatewayInit {
	private logger: Logger = new Logger('SocketsExentsGateway');
	private summaryClient: number = 0;

	public afterInit(server: Server) {
		this.logger.log(`Websocket server initialized total: ${this.summaryClient}`);
	}

	handleConnection(client: WebSocket, ...args: any[]) {
		this.summaryClient++;
		this.logger.log(` == Client connected total: ${this.summaryClient} == `);
	}

	handleDisconnect(client: WebSocket) {
		this.summaryClient--;

		this.logger.log(` == Client disconnected left total: ${this.summaryClient} == `);
	}

	@SubscribeMessage('message')
	handleMessage(client: WebSocket, payload: any): string {
		return 'Hello world!';
	}
}

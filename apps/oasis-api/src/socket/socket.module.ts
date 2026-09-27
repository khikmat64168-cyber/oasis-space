import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SocketGateway } from './socket.gateway';
import { AuthModule } from '../components/auth/auth.module';
import MessageSchema from '../schema/Message.model';
import MemberSchema from '../schema/Member.model';

@Module({
	imports: [
		MongooseModule.forFeature([{ name: 'Message', schema: MessageSchema }]),
		MongooseModule.forFeature([{ name: 'Member', schema: MemberSchema }]),
		// verifyToken() for the ?token= query parameter on the socket handshake
		AuthModule,
	],
	providers: [SocketGateway],
})
export class SocketModule {}

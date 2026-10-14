import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EventResolver } from './event.resolver';
import { EventService } from './event.service';
import EventSchema from '../../schema/Event.model';
import { AuthModule } from '../auth/auth.module';

@Module({
	imports: [MongooseModule.forFeature([{ name: 'Event', schema: EventSchema }]), AuthModule],
	providers: [EventResolver, EventService],
	exports: [EventService],
})
export class EventModule {}

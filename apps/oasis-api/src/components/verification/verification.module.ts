import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { VerificationService } from './verification.service';
import { VerificationResolver } from './verification.resolver';
import { SmsService } from '../../libs/sms/sms.service';
import PhoneVerificationSchema from '../../schema/PhoneVerification.model';

@Module({
	imports: [
		MongooseModule.forFeature([{ name: 'PhoneVerification', schema: PhoneVerificationSchema }]),
		// same secret as the access token, but tickets carry purpose:'phone_verification'
		// and a 15-minute life, so one can never be used as the other
		JwtModule.register({ secret: `${process.env.SECRET_TOKEN}` }),
	],
	providers: [VerificationService, VerificationResolver, SmsService],
	exports: [VerificationService],
})
export class VerificationModule {}

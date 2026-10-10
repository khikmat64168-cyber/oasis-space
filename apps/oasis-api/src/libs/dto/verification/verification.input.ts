import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, Length, Matches } from 'class-validator';

@InputType()
export class PhoneCodeRequestInput {
	@IsNotEmpty()
	@Length(6, 20)
	@Field(() => String)
	phone!: string;
}

@InputType()
export class PhoneCodeVerifyInput {
	@IsNotEmpty()
	@Length(6, 20)
	@Field(() => String)
	phone!: string;

	/* six digits, checked again in the service: a shape check here keeps
	   obvious junk off the bcrypt comparison */
	@IsNotEmpty()
	@Matches(/^\d{6}$/, { message: 'The code is six digits.' })
	@Field(() => String)
	code!: string;
}

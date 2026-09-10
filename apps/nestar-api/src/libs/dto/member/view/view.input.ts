import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, Length } from 'class-validator';
import { MemberAuthType, MemberStatus, MemberType } from '../../../enums/member.enums';
import { ViewGroup } from '../../../enums/view.enum';
import * as mongoose from 'mongoose';

@InputType()
export class ViewInput {
	@IsNotEmpty()
	@Field(() => String)
	memberId!: mongoose.ObjectId;

	@IsNotEmpty()
	@Field(() => ViewGroup)
	viewGroup!: string;

	@IsNotEmpty()
	@Field(() => String)
	viewRefId!: mongoose.ObjectId;
}

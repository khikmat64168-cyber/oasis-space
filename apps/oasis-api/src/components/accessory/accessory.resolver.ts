import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import type { ObjectId } from 'mongoose';
import * as mongoose from 'mongoose';
import { AccessoryService } from './accessory.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { MemberType } from '../../libs/enums/member.enums';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthGuard } from '../auth/guards/auth.guard';
import { WithoutGuard } from '../auth/guards/without.guard';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import {
	AccessoriesInquiry,
	AccessoryInput,
	AgentAccessoriesInquiry,
	AllAccessoriesInquiry,
} from '../../libs/dto/accessory/accessory.input';
import { OrdinaryInquiry } from '../../libs/dto/plant/plant.input';
import { Accessories, Accessory } from '../../libs/dto/accessory/accessory';
import { AccessoryUpdate } from '../../libs/dto/accessory/accessory.update';
import { shapeIntoMongoObjectId } from '../../libs/config';

@Resolver()
export class AccessoryResolver {
	constructor(private readonly accessoryService: AccessoryService) {}

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Accessory)
	public async createAccessory(
		@Args('input') input: AccessoryInput,
		@AuthMember('_id') memberId: mongoose.ObjectId,
	): Promise<Accessory> {
		console.log('Mutation: createAccessory');
		input.memberId = memberId;
		return await this.accessoryService.createAccessory(input);
	}

	@UseGuards(WithoutGuard)
	@Query(() => Accessory)
	public async getAccessory(
		@Args('accessoryId') input: string,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Accessory> {
		console.log('Query: getAccessory');
		const accessoryId = shapeIntoMongoObjectId(input);
		return await this.accessoryService.getAccessory(memberId, accessoryId);
	}

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Accessory)
	public async updateAccessory(
		@Args('input') input: AccessoryUpdate,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Accessory> {
		console.log('Mutation: updateAccessory');
		input._id = shapeIntoMongoObjectId(input._id);
		return await this.accessoryService.updateAccessory(memberId, input);
	}

	@UseGuards(WithoutGuard)
	@Query(() => Accessories)
	public async getAccessories(
		@Args('input') input: AccessoriesInquiry,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Accessories> {
		console.log('Query: getAccessories');
		return await this.accessoryService.getAccessories(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Query(() => Accessories)
	public async getFavoriteAccessories(
		@Args('input') input: OrdinaryInquiry,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Accessories> {
		console.log('Query: getFavoriteAccessories');
		return await this.accessoryService.getFavoriteAccessories(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Query(() => Accessories)
	public async getVisitedAccessories(
		@Args('input') input: OrdinaryInquiry,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Accessories> {
		console.log('Query: getVisitedAccessories');
		return await this.accessoryService.getVisitedAccessories(memberId, input);
	}

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Query(() => Accessories)
	public async getAgentAccessories(
		@Args('input') input: AgentAccessoriesInquiry,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Accessories> {
		console.log('Query: getAgentAccessories');
		return await this.accessoryService.getAgentAccessories(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Accessory)
	public async likeTargetAccessory(
		@Args('accessoryId') input: string,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Accessory> {
		console.log('Mutation: likeTargetAccessory');
		const likeRefId = shapeIntoMongoObjectId(input);
		return await this.accessoryService.likeTargetAccessory(memberId, likeRefId);
	}

	/** ADMIN **/

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => Accessories)
	public async getAllAccessoriesByAdmin(@Args('input') input: AllAccessoriesInquiry): Promise<Accessories> {
		console.log('Query: getAllAccessoriesByAdmin');
		return await this.accessoryService.getAllAccessoriesByAdmin(input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Accessory)
	public async updateAccessoryByAdmin(@Args('input') input: AccessoryUpdate): Promise<Accessory> {
		console.log('Mutation: updateAccessoryByAdmin');
		input._id = shapeIntoMongoObjectId(input._id);
		return await this.accessoryService.updateAccessoryByAdmin(input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Accessory)
	public async removeAccessoryByAdmin(@Args('accessoryId') input: string): Promise<Accessory> {
		console.log('Mutation: removeAccessoryByAdmin');
		const accessoryId = shapeIntoMongoObjectId(input);
		return await this.accessoryService.removeAccessoryByAdmin(accessoryId);
	}
}

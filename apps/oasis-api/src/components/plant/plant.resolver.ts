import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import type { ObjectId } from 'mongoose';
import * as mongoose from 'mongoose';
import { PlantService } from './plant.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { MemberType } from '../../libs/enums/member.enums';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthGuard } from '../auth/guards/auth.guard';
import { WithoutGuard } from '../auth/guards/without.guard';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import {
	AgentPlantsInquiry,
	AllPlantsInquiry,
	OrdinaryInquiry,
	PlantInput,
	PlantsInquiry,
} from '../../libs/dto/plant/plant.input';
import { Plants, Plant } from '../../libs/dto/plant/plant';
import { PlantUpdate } from '../../libs/dto/plant/plant.update';
import { shapeIntoMongoObjectId } from '../../libs/config';

@Resolver()
export class PlantResolver {
	constructor(private readonly plantService: PlantService) {}

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Plant)
	public async createPlant(
		@Args('input') input: PlantInput,
		@AuthMember('_id') memberId: mongoose.ObjectId,
	): Promise<Plant> {
		console.log('Mutation: createPlant');
		input.memberId = memberId;
		return await this.plantService.createPlant(input);
	}

	@UseGuards(WithoutGuard)
	@Query(() => Plant)
	public async getPlant(@Args('plantId') input: string, @AuthMember('_id') memberId: ObjectId): Promise<Plant> {
		console.log('Query: getPlant');
		const plantId = shapeIntoMongoObjectId(input);
		return await this.plantService.getPlant(memberId, plantId);
	}

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Plant)
	public async updatePlant(
		@Args('input') input: PlantUpdate,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Plant> {
		console.log('Mutation: updatePlant');
		input._id = shapeIntoMongoObjectId(input._id);
		return await this.plantService.updatePlant(memberId, input);
	}

	@UseGuards(WithoutGuard)
	@Query(() => Plants)
	public async getPlants(
		@Args('input') input: PlantsInquiry,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Plants> {
		console.log('Query: getPlants');
		return await this.plantService.getPlants(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Query(() => Plants)
	public async getFavorites(
		@Args('input') input: OrdinaryInquiry,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Plants> {
		console.log('Query: getFavorites');
		return await this.plantService.getFavorites(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Query(() => Plants)
	public async getVisited(
		@Args('input') input: OrdinaryInquiry,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Plants> {
		console.log('Query: getVisited');
		return await this.plantService.getVisited(memberId, input);
	}

	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Query(() => Plants)
	public async getAgentPlants(
		@Args('input') input: AgentPlantsInquiry,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Plants> {
		console.log('Query: getAgentPlants');
		return await this.plantService.getAgentPlants(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Mutation(() => Plant)
	public async likeTargetPlant(
		@Args('plantId') input: string,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Plant> {
		console.log('Mutation: likeTargetPlant');
		const likeRefId = shapeIntoMongoObjectId(input);
		return await this.plantService.likeTargetPlant(memberId, likeRefId);
	}

	/** ADMIN **/

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => Plants)
	public async getAllPlantsByAdmin(@Args('input') input: AllPlantsInquiry): Promise<Plants> {
		console.log('Query: getAllPlantsByAdmin');
		return await this.plantService.getAllPlantsByAdmin(input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Plant)
	public async updatePlantByAdmin(@Args('input') input: PlantUpdate): Promise<Plant> {
		console.log('Mutation: updatePlantByAdmin');
		input._id = shapeIntoMongoObjectId(input._id);
		return await this.plantService.updatePlantByAdmin(input);
	}

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => Plant)
	public async removePlantByAdmin(@Args('plantId') input: string): Promise<Plant> {
		console.log('Mutation: removePlantByAdmin');
		const plantId = shapeIntoMongoObjectId(input);
		return await this.plantService.removePlantByAdmin(plantId);
	}
}

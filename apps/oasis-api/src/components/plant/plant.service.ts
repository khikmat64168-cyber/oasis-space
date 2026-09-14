import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import moment from 'moment';
import { Plants, Plant } from '../../libs/dto/plant/plant';
import { Direction, Message } from '../../libs/Errors';
import {
	AgentPlantsInquiry,
	AllPlantsInquiry,
	OrdinaryInquiry,
	PlantInput,
	PlantsInquiry,
} from '../../libs/dto/plant/plant.input';
import { PlantUpdate } from '../../libs/dto/plant/plant.update';
import { MemberService } from '../member/member.service';
import { StatisticModifier, T } from '../../libs/types/common';
import { PlantStatus } from '../../libs/enums/plant.enum';
import { ViewGroup } from '../../libs/enums/view.enum';
import { ViewService } from '../view/view.service';
import { LikeService } from '../like/like.service';
import { LikeInput } from '../../libs/dto/member/like/like.input';
import { LikeGroup } from '../../libs/enums/like.enum';
import { lookupAuthMemberLiked, lookupMember, shapeIntoMongoObjectId } from '../../libs/config';

@Injectable()
export class PlantService {
	constructor(
		@InjectModel('Plant') private readonly plantModel: Model<Plant>,
		private memberService: MemberService,
		private viewService: ViewService,
		private likeService: LikeService,
	) {}

	public async createPlant(input: PlantInput): Promise<Plant> {
		try {
			const result = await this.plantModel.create(input);
			await this.memberService.memberStatsEditor({
				_id: result.memberId,
				targetKey: 'memberPlants',
				modifier: 1,
			});
			return result;
		} catch (err) {
			console.log('Error, Service.model:', err);
			throw new BadRequestException(Message.CREATE_FAILED);
		}
	}

	public async getPlant(memberId: ObjectId, plantId: ObjectId): Promise<Plant> {
		const search: T = {
			_id: plantId,
			plantStatus: PlantStatus.ACTIVE,
		};

		const targetPlant = (await this.plantModel.findOne(search).lean().exec()) as Plant | null;
		if (!targetPlant) throw new InternalServerErrorException(Message.NO_DATA_FOUND);

		if (memberId) {
			const viewInput = { memberId: memberId, viewRefId: plantId, viewGroup: ViewGroup.PLANT };
			const newView = await this.viewService.recordView(viewInput);
			if (newView) {
				await this.plantStatsEditor({ _id: plantId, targetKey: 'plantViews', modifier: 1 });
				targetPlant.plantViews++;
			}

			const likeInput = { memberId: memberId, likeRefId: plantId, likeGroup: LikeGroup.PLANT };
			const meLiked = await this.likeService.checkLikeExistence(likeInput);
			targetPlant.meLiked = meLiked ? [meLiked] : [];
		}

		targetPlant.memberData = await this.memberService.getMember(null, targetPlant.memberId);
		return targetPlant;
	}

	public async plantStatsEditor(input: StatisticModifier): Promise<Plant | null> {
		const { _id, targetKey, modifier } = input;
		return await this.plantModel
			.findByIdAndUpdate(_id, { $inc: { [targetKey]: modifier } }, { new: true })
			.exec();
	}

	public async updatePlant(memberId: ObjectId, input: PlantUpdate): Promise<Plant> {
		let { plantStatus, soldAt, deletedAt } = input;
		const search: T = {
			_id: input._id,
			memberId: memberId,
			plantStatus: PlantStatus.ACTIVE,
		};

		if (plantStatus === PlantStatus.SOLD_OUT) soldAt = moment().toDate();
		else if (plantStatus === PlantStatus.DELETE) deletedAt = moment().toDate();

		const result = await this.plantModel.findOneAndUpdate(search, input, { new: true }).exec();
		if (!result) throw new InternalServerErrorException(Message.UPDATE_FAILED);

		if (soldAt || deletedAt) {
			await this.memberService.memberStatsEditor({
				_id: memberId,
				targetKey: 'memberPlants',
				modifier: -1,
			});
		}

		return result;
	}

	public async getPlants(memberId: ObjectId, input: PlantsInquiry): Promise<Plants> {
		const match: T = { plantStatus: PlantStatus.ACTIVE };
		const sort: T = { [input?.sort ?? 'createdAt']: input?.direction ?? Direction.DESC };

		this.shapeMatchQuery(match, input);
		console.log('match:', match);

		const result = await this.plantModel
			.aggregate([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							lookupAuthMemberLiked(memberId),
							lookupMember,
							{ $unwind: '$memberData' },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		if (!result.length) throw new InternalServerErrorException(Message.NO_DATA_FOUND);

		return result[0];
	}

	private shapeMatchQuery(match: T, input: PlantsInquiry): void {
		const { memberId, locationList, typeList, categoryList, periodsRange, pricesRange, heightsRange, text } =
			input.search;

		if (memberId) match.memberId = shapeIntoMongoObjectId(memberId);
		if (locationList && locationList.length) match.supplyLocation = { $in: locationList };
		if (typeList && typeList.length) match.plantType = { $in: typeList };
		if (categoryList && categoryList.length) match.plantCategory = { $in: categoryList };

		if (pricesRange) match.plantPrice = { $gte: pricesRange.start, $lte: pricesRange.end };
		if (heightsRange) match.plantHeight = { $gte: heightsRange.start, $lte: heightsRange.end };
		if (periodsRange) match.createdAt = { $gte: periodsRange.start, $lte: periodsRange.end };

		if (text) match.plantName = { $regex: new RegExp(text, 'i') };
	}

	public async getFavorites(memberId: ObjectId, input: OrdinaryInquiry): Promise<Plants> {
		return await this.likeService.getFavoritePlants(memberId, input);
	}

	public async getVisited(memberId: ObjectId, input: OrdinaryInquiry): Promise<Plants> {
		return await this.viewService.getVisitedPlants(memberId, input);
	}

	public async getAgentPlants(memberId: ObjectId, input: AgentPlantsInquiry): Promise<Plants> {
		const { plantStatus } = input.search;
		if (plantStatus === PlantStatus.DELETE) throw new BadRequestException(Message.NOT_ALLOWED_REQUEST);

		const match: T = {
			memberId: memberId,
			plantStatus: plantStatus ?? { $ne: PlantStatus.DELETE },
		};
		const sort: T = { [input?.sort ?? 'createdAt']: input?.direction ?? Direction.DESC };

		const result = await this.plantModel
			.aggregate([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							lookupMember,
							{ $unwind: '$memberData' },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		if (!result.length) throw new InternalServerErrorException(Message.NO_DATA_FOUND);

		return result[0];
	}

	public async likeTargetPlant(memberId: ObjectId, likeRefId: ObjectId): Promise<Plant> {
		const target: Plant | null = await this.plantModel
			.findOne({ _id: likeRefId, plantStatus: PlantStatus.ACTIVE })
			.exec();
		if (!target) throw new InternalServerErrorException(Message.NO_DATA_FOUND);

		const input: LikeInput = {
			memberId: memberId,
			likeRefId: likeRefId,
			likeGroup: LikeGroup.PLANT,
		};

		const modifier: number = await this.likeService.toggleLike(input);
		const result = await this.plantStatsEditor({ _id: likeRefId, targetKey: 'plantLikes', modifier: modifier });

		if (!result) throw new InternalServerErrorException(Message.SOMETHING_WENT_WRONG);
		return result;
	}

	public async getAllPlantsByAdmin(input: AllPlantsInquiry): Promise<Plants> {
		const { plantStatus, plantLocationList } = input.search;
		const match: T = {};
		const sort: T = { [input?.sort ?? 'createdAt']: input?.direction ?? Direction.DESC };

		if (plantStatus) match.plantStatus = plantStatus;
		if (plantLocationList) match.supplyLocation = { $in: plantLocationList };

		const result = await this.plantModel
			.aggregate([
				{ $match: match },
				{ $sort: sort },
				{
					$facet: {
						list: [
							{ $skip: (input.page - 1) * input.limit },
							{ $limit: input.limit },
							lookupMember,
							{ $unwind: '$memberData' },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		if (!result.length) throw new InternalServerErrorException(Message.NO_DATA_FOUND);

		return result[0];
	}

	public async updatePlantByAdmin(input: PlantUpdate): Promise<Plant> {
		let { plantStatus, soldAt, deletedAt } = input;
		const search: T = {
			_id: input._id,
			plantStatus: PlantStatus.ACTIVE,
		};

		if (plantStatus === PlantStatus.SOLD_OUT) soldAt = moment().toDate();
		else if (plantStatus === PlantStatus.DELETE) deletedAt = moment().toDate();

		const result = await this.plantModel.findOneAndUpdate(search, input, { new: true }).exec();
		if (!result) throw new InternalServerErrorException(Message.UPDATE_FAILED);

		if (soldAt || deletedAt) {
			await this.memberService.memberStatsEditor({
				_id: result.memberId,
				targetKey: 'memberPlants',
				modifier: -1,
			});
		}

		return result;
	}

	public async removePlantByAdmin(plantId: ObjectId): Promise<Plant> {
		const search: T = { _id: plantId, plantStatus: PlantStatus.DELETE };
		const result = await this.plantModel.findOneAndDelete(search).exec();
		if (!result) throw new InternalServerErrorException(Message.REMOVE_FAILED);

		return result;
	}
}

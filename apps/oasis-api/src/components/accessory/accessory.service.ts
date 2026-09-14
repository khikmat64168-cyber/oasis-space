import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import moment from 'moment';
import { Accessories, Accessory } from '../../libs/dto/accessory/accessory';
import { Direction, Message } from '../../libs/Errors';
import {
	AccessoriesInquiry,
	AccessoryInput,
	AgentAccessoriesInquiry,
	AllAccessoriesInquiry,
} from '../../libs/dto/accessory/accessory.input';
import { AccessoryUpdate } from '../../libs/dto/accessory/accessory.update';
import { OrdinaryInquiry } from '../../libs/dto/plant/plant.input';
import { MemberService } from '../member/member.service';
import { StatisticModifier, T } from '../../libs/types/common';
import { AccessoryStatus } from '../../libs/enums/accessory.enum';
import { ViewGroup } from '../../libs/enums/view.enum';
import { ViewService } from '../view/view.service';
import { LikeService } from '../like/like.service';
import { LikeInput } from '../../libs/dto/member/like/like.input';
import { LikeGroup } from '../../libs/enums/like.enum';
import { lookupAuthMemberLiked, lookupMember, shapeIntoMongoObjectId } from '../../libs/config';

@Injectable()
export class AccessoryService {
	constructor(
		@InjectModel('Accessory') private readonly accessoryModel: Model<Accessory>,
		private memberService: MemberService,
		private viewService: ViewService,
		private likeService: LikeService,
	) {}

	public async createAccessory(input: AccessoryInput): Promise<Accessory> {
		try {
			const result = await this.accessoryModel.create(input);
			await this.memberService.memberStatsEditor({
				_id: result.memberId,
				targetKey: 'memberAccessories',
				modifier: 1,
			});
			return result;
		} catch (err) {
			console.log('Error, Service.model:', err);
			throw new BadRequestException(Message.CREATE_FAILED);
		}
	}

	public async getAccessory(memberId: ObjectId, accessoryId: ObjectId): Promise<Accessory> {
		const search: T = { _id: accessoryId, accessoryStatus: AccessoryStatus.ACTIVE };

		const target = (await this.accessoryModel.findOne(search).lean().exec()) as Accessory | null;
		if (!target) throw new InternalServerErrorException(Message.NO_DATA_FOUND);

		if (memberId) {
			const viewInput = { memberId: memberId, viewRefId: accessoryId, viewGroup: ViewGroup.ACCESSORY };
			const newView = await this.viewService.recordView(viewInput);
			if (newView) {
				await this.accessoryStatsEditor({ _id: accessoryId, targetKey: 'accessoryViews', modifier: 1 });
				target.accessoryViews++;
			}

			const likeInput = { memberId: memberId, likeRefId: accessoryId, likeGroup: LikeGroup.ACCESSORY };
			const meLiked = await this.likeService.checkLikeExistence(likeInput);
			target.meLiked = meLiked ? [meLiked] : [];
		}

		target.memberData = await this.memberService.getMember(null, target.memberId);
		return target;
	}

	public async accessoryStatsEditor(input: StatisticModifier): Promise<Accessory | null> {
		const { _id, targetKey, modifier } = input;
		return await this.accessoryModel
			.findByIdAndUpdate(_id, { $inc: { [targetKey]: modifier } }, { new: true })
			.exec();
	}

	public async updateAccessory(memberId: ObjectId, input: AccessoryUpdate): Promise<Accessory> {
		let { accessoryStatus, soldAt, deletedAt } = input;
		const search: T = {
			_id: input._id,
			memberId: memberId,
			accessoryStatus: AccessoryStatus.ACTIVE,
		};

		if (accessoryStatus === AccessoryStatus.SOLD_OUT) soldAt = moment().toDate();
		else if (accessoryStatus === AccessoryStatus.DELETE) deletedAt = moment().toDate();

		const result = await this.accessoryModel.findOneAndUpdate(search, input, { new: true }).exec();
		if (!result) throw new InternalServerErrorException(Message.UPDATE_FAILED);

		if (soldAt || deletedAt) {
			await this.memberService.memberStatsEditor({ _id: memberId, targetKey: 'memberAccessories', modifier: -1 });
		}

		return result;
	}

	public async getAccessories(memberId: ObjectId, input: AccessoriesInquiry): Promise<Accessories> {
		const match: T = { accessoryStatus: AccessoryStatus.ACTIVE };
		const sort: T = { [input?.sort ?? 'createdAt']: input?.direction ?? Direction.DESC };

		this.shapeMatchQuery(match, input);
		console.log('match:', match);

		const result = await this.accessoryModel
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

	private shapeMatchQuery(match: T, input: AccessoriesInquiry): void {
		const { memberId, locationList, typeList, categoryList, periodsRange, pricesRange, text } = input.search;

		if (memberId) match.memberId = shapeIntoMongoObjectId(memberId);
		if (locationList && locationList.length) match.supplyLocation = { $in: locationList };
		if (typeList && typeList.length) match.accessoryType = { $in: typeList };
		if (categoryList && categoryList.length) match.accessoryCategory = { $in: categoryList };

		if (pricesRange) match.accessoryPrice = { $gte: pricesRange.start, $lte: pricesRange.end };
		if (periodsRange) match.createdAt = { $gte: periodsRange.start, $lte: periodsRange.end };
		if (text) match.accessoryName = { $regex: new RegExp(text, 'i') };
	}

	public async getFavoriteAccessories(memberId: ObjectId, input: OrdinaryInquiry): Promise<Accessories> {
		return await this.likeService.getFavoriteAccessories(memberId, input);
	}

	public async getVisitedAccessories(memberId: ObjectId, input: OrdinaryInquiry): Promise<Accessories> {
		return await this.viewService.getVisitedAccessories(memberId, input);
	}

	public async getAgentAccessories(memberId: ObjectId, input: AgentAccessoriesInquiry): Promise<Accessories> {
		const { accessoryStatus } = input.search;
		if (accessoryStatus === AccessoryStatus.DELETE) throw new BadRequestException(Message.NOT_ALLOWED_REQUEST);

		const match: T = {
			memberId: memberId,
			accessoryStatus: accessoryStatus ?? { $ne: AccessoryStatus.DELETE },
		};
		const sort: T = { [input?.sort ?? 'createdAt']: input?.direction ?? Direction.DESC };

		const result = await this.accessoryModel
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

	public async likeTargetAccessory(memberId: ObjectId, likeRefId: ObjectId): Promise<Accessory> {
		const target: Accessory | null = await this.accessoryModel
			.findOne({ _id: likeRefId, accessoryStatus: AccessoryStatus.ACTIVE })
			.exec();
		if (!target) throw new InternalServerErrorException(Message.NO_DATA_FOUND);

		const input: LikeInput = { memberId: memberId, likeRefId: likeRefId, likeGroup: LikeGroup.ACCESSORY };

		const modifier: number = await this.likeService.toggleLike(input);
		const result = await this.accessoryStatsEditor({
			_id: likeRefId,
			targetKey: 'accessoryLikes',
			modifier: modifier,
		});

		if (!result) throw new InternalServerErrorException(Message.SOMETHING_WENT_WRONG);
		return result;
	}

	public async getAllAccessoriesByAdmin(input: AllAccessoriesInquiry): Promise<Accessories> {
		const { accessoryStatus, accessoryLocationList } = input.search;
		const match: T = {};
		const sort: T = { [input?.sort ?? 'createdAt']: input?.direction ?? Direction.DESC };

		if (accessoryStatus) match.accessoryStatus = accessoryStatus;
		if (accessoryLocationList) match.supplyLocation = { $in: accessoryLocationList };

		const result = await this.accessoryModel
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

	public async updateAccessoryByAdmin(input: AccessoryUpdate): Promise<Accessory> {
		let { accessoryStatus, soldAt, deletedAt } = input;
		const search: T = { _id: input._id, accessoryStatus: AccessoryStatus.ACTIVE };

		if (accessoryStatus === AccessoryStatus.SOLD_OUT) soldAt = moment().toDate();
		else if (accessoryStatus === AccessoryStatus.DELETE) deletedAt = moment().toDate();

		const result = await this.accessoryModel.findOneAndUpdate(search, input, { new: true }).exec();
		if (!result) throw new InternalServerErrorException(Message.UPDATE_FAILED);

		if (soldAt || deletedAt) {
			await this.memberService.memberStatsEditor({
				_id: result.memberId,
				targetKey: 'memberAccessories',
				modifier: -1,
			});
		}

		return result;
	}

	public async removeAccessoryByAdmin(accessoryId: ObjectId): Promise<Accessory> {
		const search: T = { _id: accessoryId, accessoryStatus: AccessoryStatus.DELETE };
		const result = await this.accessoryModel.findOneAndDelete(search).exec();
		if (!result) throw new InternalServerErrorException(Message.REMOVE_FAILED);
		return result;
	}
}

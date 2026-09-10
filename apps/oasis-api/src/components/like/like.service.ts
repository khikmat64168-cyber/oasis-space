import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Like, MeLiked } from '../../libs/dto/member/like/like';
import { Model, ObjectId } from 'mongoose';
import { LikeInput } from '../../libs/dto/member/like/like.input';
import { Message } from '../../libs/Errors';
import { T } from '../../libs/types/common';
import { Plants } from '../../libs/dto/plant/plant';
import { OrdinaryInquiry } from '../../libs/dto/plant/plant.input';
import { LikeGroup } from '../../libs/enums/like.enum';
import { lookupFavorite } from '../../libs/config';

@Injectable()
export class LikeService {
	constructor(@InjectModel('Like') private readonly likeModel: Model<Like>) {}

	public async toggleLike(input: LikeInput): Promise<number> {
		const search: T = { memberId: input.memberId, likeRefId: input.likeRefId };
		const exist = await this.likeModel.findOne(search).exec();
		let modifier = 1;

		if (exist) {
			await this.likeModel.findOneAndDelete(search).exec();
			modifier = -1;
		} else {
			try {
				await this.likeModel.create(input);
			} catch (err) {
				console.log('Error, Service.model:', err);
				throw new BadRequestException(Message.CREATE_FAILED);
			}
		}

		console.log(`- Like modifier ${modifier} -`);
		return modifier;
	}

	public async checkLikeExistence(input: LikeInput): Promise<MeLiked | null> {
		const { memberId, likeRefId } = input;
		const result = await this.likeModel.findOne({ memberId: memberId, likeRefId: likeRefId }).exec();
		return result ? { memberId: memberId, likeRefId: likeRefId, myFavorite: true } : null;
	}

	public async getFavoritePlants(memberId: ObjectId, input: OrdinaryInquiry): Promise<Plants> {
		const { page, limit } = input;
		const match: T = { likeGroup: LikeGroup.PLANT, memberId: memberId };

		const data: T = await this.likeModel
			.aggregate([
				{ $match: match },
				{ $sort: { updatedAt: -1 } },
				{
					$lookup: {
						from: 'plants',
						localField: 'likeRefId',
						foreignField: '_id',
						as: 'favoritePlant',
					},
				},
				{ $unwind: '$favoritePlant' },
				{
					$facet: {
						list: [
							{ $skip: (page - 1) * limit },
							{ $limit: limit },
							lookupFavorite,
							{ $unwind: '$favoritePlant.memberData' },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		const result: Plants = { list: [], metaCounter: data[0].metaCounter };
		result.list = data[0].list.map((ele) => ele.favoritePlant);

		return result;
	}
}

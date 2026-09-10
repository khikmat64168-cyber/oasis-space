import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { View } from '../../libs/dto/member/view/view';
import { ViewInput } from '../../libs/dto/member/view/view.input';
import { T } from '../../libs/types/common';
import { Plants } from '../../libs/dto/plant/plant';
import { OrdinaryInquiry } from '../../libs/dto/plant/plant.input';
import { ViewGroup } from '../../libs/enums/view.enum';
import { lookupVisit } from '../../libs/config';

@Injectable()
export class ViewService {
	constructor(@InjectModel('View') private readonly viewModel: Model<View>) {}

	public async recordView(input: ViewInput): Promise<View | null> {
		const viewExist = await this.checkViewExistence(input);
		if (!viewExist) {
			console.log(' --- New View Insert ___');
			return this.viewModel.create(input);
		} else return null;
	}

	private async checkViewExistence(input: ViewInput): Promise<View | null> {
		const { memberId, viewRefId } = input;
		const search: T = {
			memberId: memberId,
			viewRefId: viewRefId,
		};
		return await this.viewModel.findOne(search).exec();
	}

	public async getVisitedPlants(memberId: ObjectId, input: OrdinaryInquiry): Promise<Plants> {
		const { page, limit } = input;
		const match: T = { viewGroup: ViewGroup.PLANT, memberId: memberId };

		const data: T = await this.viewModel
			.aggregate([
				{ $match: match },
				{ $sort: { updatedAt: -1 } },
				{
					$lookup: {
						from: 'plants',
						localField: 'viewRefId',
						foreignField: '_id',
						as: 'visitedPlant',
					},
				},
				{ $unwind: '$visitedPlant' },
				{
					$facet: {
						list: [
							{ $skip: (page - 1) * limit },
							{ $limit: limit },
							lookupVisit,
							{ $unwind: '$visitedPlant.memberData' },
						],
						metaCounter: [{ $count: 'total' }],
					},
				},
			])
			.exec();

		const result: Plants = { list: [], metaCounter: data[0].metaCounter };
		result.list = data[0].list.map((ele) => ele.visitedPlant);

		return result;
	}
}

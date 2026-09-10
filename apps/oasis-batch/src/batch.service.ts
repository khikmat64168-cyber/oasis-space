import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Member } from 'apps/oasis-api/src/libs/dto/member/member';
import { Plant } from 'apps/oasis-api/src/libs/dto/plant/plant';
import { MemberStatus, MemberType } from 'apps/oasis-api/src/libs/enums/member.enums';
import { PlantStatus } from 'apps/oasis-api/src/libs/enums/plant.enum';
import { Model } from 'mongoose';

@Injectable()
export class BatchService {
	constructor(
		@InjectModel('Plant') private readonly plantModel: Model<Plant>,
		@InjectModel('Member') private readonly memberModel: Model<Member>,
	) {}

	public async batchRollback(): Promise<void> {
		await this.plantModel
			.updateMany({ plantStatus: PlantStatus.ACTIVE }, { plantRank: 0 })
			.exec();

		await this.memberModel
			.updateMany({ memberStatus: MemberStatus.ACTIVE, memberType: MemberType.AGENT }, { memberRank: 0 })
			.exec();
	}

	public async batchTopPlants(): Promise<void> {
		const plants: Plant[] = await this.plantModel
			.find({ plantStatus: PlantStatus.ACTIVE, plantRank: 0 })
			.exec();

		const promiseList = plants.map(async (ele: Plant) => {
			const { _id, plantLikes, plantViews } = ele;
			const rank = plantLikes * 2 + plantViews * 1;
			return await this.plantModel.findByIdAndUpdate(_id, { plantRank: rank });
		});
		await Promise.all(promiseList);
	}

	public async batchTopAgents(): Promise<void> {
		const agents: Member[] = await this.memberModel
			.find({ memberType: MemberType.AGENT, memberStatus: MemberStatus.ACTIVE, memberRank: 0 })
			.exec();

		const promiseList = agents.map(async (ele: Member) => {
			const { _id, memberPlants, memberLikes, memberArticles, memberViews } = ele;
			const rank = memberPlants * 4 + memberArticles * 3 + memberLikes * 2 + memberViews * 1;
			return await this.memberModel.findByIdAndUpdate(_id, { memberRank: rank });
		});
		await Promise.all(promiseList);
	}

	public getHello(): string {
		return 'Welcome to Oasis BATCH Server!';
	}
}

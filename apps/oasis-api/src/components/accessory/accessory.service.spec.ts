import { AccessoryService } from './accessory.service';
import { AccessoryStatus } from '../../libs/enums/accessory.enum';
import { PlantType } from '../../libs/enums/plant.enum';

/**
 * Ownership and compatibility on the accessory service.
 *
 * The two things worth proving here are not visible from the resolver: that an
 * update is scoped to the calling member in the DATABASE QUERY rather than in
 * a code branch (so a forged payload cannot widen it), and that
 * `compatiblePlantTypes` reaches the match query the plant page relies on.
 */
function build(updateResult: any = { _id: 'a1' }) {
	const accessoryModel: any = {
		create: jest.fn().mockResolvedValue({ _id: 'a1', memberId: 'agent-1' }),
		findOneAndUpdate: jest.fn().mockReturnValue({ exec: () => Promise.resolve(updateResult) }),
		aggregate: jest.fn().mockReturnValue({ exec: () => Promise.resolve([{ list: [], metaCounter: [] }]) }),
	};
	const memberService: any = { memberStatsEditor: jest.fn().mockResolvedValue({}) };
	const viewService: any = {};
	const likeService: any = {};
	const svc = new AccessoryService(accessoryModel, memberService, viewService, likeService);
	return { svc, accessoryModel, memberService };
}

const baseInput: any = {
	accessoryName: 'Terracotta pot',
	accessoryPrice: 20000,
	accessoryImages: ['uploads/accessory/a.png'],
	compatiblePlantTypes: [PlantType.INDOOR_PLANT, PlantType.SUCCULENT],
	memberId: 'agent-1',
};

describe('AccessoryService.createAccessory', () => {
	it('persists the compatibility list it was given', async () => {
		const { svc, accessoryModel } = build();
		await svc.createAccessory(baseInput);
		expect(accessoryModel.create).toHaveBeenCalledWith(
			expect.objectContaining({ compatiblePlantTypes: [PlantType.INDOOR_PLANT, PlantType.SUCCULENT] }),
		);
	});

	it('counts the new accessory against its owner', async () => {
		const { svc, memberService } = build();
		await svc.createAccessory(baseInput);
		expect(memberService.memberStatsEditor).toHaveBeenCalledWith(
			expect.objectContaining({ targetKey: 'memberAccessories', modifier: 1 }),
		);
	});
});

describe('AccessoryService.updateAccessory — ownership', () => {
	it('scopes the update to the calling member, not to the payload', async () => {
		const { svc, accessoryModel } = build();
		// a forged memberId in the body must not widen the query
		await svc.updateAccessory('agent-1' as any, { _id: 'a1', memberId: 'agent-2', accessoryName: 'x' } as any);
		const [filter] = accessoryModel.findOneAndUpdate.mock.calls[0];
		expect(filter.memberId).toBe('agent-1');
		expect(filter._id).toBe('a1');
		expect(filter.accessoryStatus).toBe(AccessoryStatus.ACTIVE);
	});

	it('fails when the row does not belong to the caller', async () => {
		// no document matches the {_id, memberId} filter, which is what another
		// agent's id produces
		const { svc } = build(null);
		await expect(svc.updateAccessory('agent-2' as any, { _id: 'a1' } as any)).rejects.toThrow();
	});

	it('stamps deletedAt and decrements the owner when status becomes DELETE', async () => {
		const { svc, accessoryModel, memberService } = build();
		await svc.updateAccessory('agent-1' as any, { _id: 'a1', accessoryStatus: AccessoryStatus.DELETE } as any);
		const [, update] = accessoryModel.findOneAndUpdate.mock.calls[0];
		expect(update.deletedAt).toBeInstanceOf(Date);
		expect(memberService.memberStatsEditor).toHaveBeenCalledWith(
			expect.objectContaining({ targetKey: 'memberAccessories', modifier: -1 }),
		);
	});
});

describe('AccessoryService.getAccessories — compatibleWith', () => {
	const inquiry = (search: any) => ({ page: 1, limit: 10, search } as any);

	it('matches accessories whose compatibility list contains the plant type', async () => {
		const { svc, accessoryModel } = build();
		await svc.getAccessories(null as any, inquiry({ compatibleWith: PlantType.SUCCULENT }));
		const pipeline = accessoryModel.aggregate.mock.calls[0][0];
		expect(pipeline[0].$match.compatiblePlantTypes).toBe(PlantType.SUCCULENT);
	});

	it('leaves the filter out entirely when no plant type was asked for', async () => {
		const { svc, accessoryModel } = build();
		await svc.getAccessories(null as any, inquiry({}));
		const pipeline = accessoryModel.aggregate.mock.calls[0][0];
		expect(pipeline[0].$match.compatiblePlantTypes).toBeUndefined();
	});

	it('only ever returns active accessories', async () => {
		const { svc, accessoryModel } = build();
		await svc.getAccessories(null as any, inquiry({ compatibleWith: PlantType.TREE }));
		const pipeline = accessoryModel.aggregate.mock.calls[0][0];
		expect(pipeline[0].$match.accessoryStatus).toBe(AccessoryStatus.ACTIVE);
	});
});

describe('AccessoryService.getAgentAccessories — scope', () => {
	it('matches only the calling agent and hides deleted rows', async () => {
		const { svc, accessoryModel } = build();
		await svc.getAgentAccessories('agent-1' as any, { page: 1, limit: 10, search: {} } as any);
		const pipeline = accessoryModel.aggregate.mock.calls[0][0];
		expect(pipeline[0].$match.memberId).toBe('agent-1');
		expect(pipeline[0].$match.accessoryStatus).toEqual({ $ne: AccessoryStatus.DELETE });
	});

	it('refuses an explicit request for deleted rows', async () => {
		const { svc } = build();
		await expect(
			svc.getAgentAccessories('agent-1' as any, {
				page: 1,
				limit: 10,
				search: { accessoryStatus: AccessoryStatus.DELETE },
			} as any),
		).rejects.toThrow();
	});
});

import { PlantService } from './plant.service';
import { PlantStatus } from '../../libs/enums/plant.enum';

/**
 * Removing a plant from an agent's inventory.
 *
 * There is no delete mutation: removal is `updatePlant` with
 * plantStatus = DELETE, which is a soft delete. These tests pin the two
 * properties that make that safe — the row is never actually dropped (so order
 * history keeps resolving it) and the query is scoped to the caller in the
 * FILTER, not in a code branch a forged payload could skip.
 */
function build(updateResult: any = { _id: 'p1' }) {
	const plantModel: any = {
		create: jest.fn().mockResolvedValue({ _id: 'p1', memberId: 'agent-1' }),
		findOneAndUpdate: jest.fn().mockReturnValue({ exec: () => Promise.resolve(updateResult) }),
		deleteOne: jest.fn(),
		deleteMany: jest.fn(),
		aggregate: jest.fn().mockReturnValue({ exec: () => Promise.resolve([{ list: [], metaCounter: [] }]) }),
	};
	const memberService: any = { memberStatsEditor: jest.fn().mockResolvedValue({}) };
	const svc = new PlantService(plantModel, memberService, {} as any, {} as any);
	return { svc, plantModel, memberService };
}

describe('PlantService.updatePlant — removal', () => {
	it('is a soft delete: the document is never removed', async () => {
		const { svc, plantModel } = build();
		await svc.updatePlant('agent-1' as any, { _id: 'p1', plantStatus: PlantStatus.DELETE } as any);
		expect(plantModel.deleteOne).not.toHaveBeenCalled();
		expect(plantModel.deleteMany).not.toHaveBeenCalled();
		const [, update] = plantModel.findOneAndUpdate.mock.calls[0];
		expect(update.plantStatus).toBe(PlantStatus.DELETE);
		expect(update.deletedAt).toBeInstanceOf(Date);
	});

	it('scopes the write to the caller, not to the payload', async () => {
		const { svc, plantModel } = build();
		await svc.updatePlant('agent-1' as any, {
			_id: 'p1',
			memberId: 'agent-2',
			plantStatus: PlantStatus.DELETE,
		} as any);
		const [filter] = plantModel.findOneAndUpdate.mock.calls[0];
		expect(filter.memberId).toBe('agent-1');
		expect(filter._id).toBe('p1');
		// an already-removed listing cannot be removed again
		expect(filter.plantStatus).toBe(PlantStatus.ACTIVE);
	});

	it("fails when the listing is not the caller's, or does not exist", async () => {
		const { svc } = build(null);
		await expect(
			svc.updatePlant('agent-2' as any, { _id: 'p1', plantStatus: PlantStatus.DELETE } as any),
		).rejects.toThrow();
	});

	it('drops the owner listing count by one on removal', async () => {
		const { svc, memberService } = build();
		await svc.updatePlant('agent-1' as any, { _id: 'p1', plantStatus: PlantStatus.DELETE } as any);
		expect(memberService.memberStatsEditor).toHaveBeenCalledWith(
			expect.objectContaining({ targetKey: 'memberPlants', modifier: -1 }),
		);
	});
});

describe('PlantService.updatePlant — stock edit still works', () => {
	it('writes the new stock and leaves the listing count alone', async () => {
		const { svc, plantModel, memberService } = build();
		await svc.updatePlant('agent-1' as any, { _id: 'p1', plantStock: 12 } as any);
		const [, update] = plantModel.findOneAndUpdate.mock.calls[0];
		expect(update.plantStock).toBe(12);
		expect(update.deletedAt).toBeUndefined();
		// nothing left the inventory, so the counter must not move
		expect(memberService.memberStatsEditor).not.toHaveBeenCalled();
	});

	it('stamps soldAt when the listing sells out, without deleting it', async () => {
		const { svc, plantModel } = build();
		await svc.updatePlant('agent-1' as any, { _id: 'p1', plantStatus: PlantStatus.SOLD_OUT } as any);
		const [, update] = plantModel.findOneAndUpdate.mock.calls[0];
		expect(update.soldAt).toBeInstanceOf(Date);
		expect(update.deletedAt).toBeUndefined();
	});
});

describe('PlantService.getAgentPlants — what an agent sees', () => {
	it('hides removed listings from the agent inventory', async () => {
		const { svc, plantModel } = build();
		await svc.getAgentPlants('agent-1' as any, { page: 1, limit: 10, search: {} } as any);
		const pipeline = plantModel.aggregate.mock.calls[0][0];
		expect(pipeline[0].$match.memberId).toBe('agent-1');
		expect(pipeline[0].$match.plantStatus).toEqual({ $ne: PlantStatus.DELETE });
	});

	it('refuses an explicit request for removed listings', async () => {
		const { svc } = build();
		await expect(
			svc.getAgentPlants('agent-1' as any, {
				page: 1,
				limit: 10,
				search: { plantStatus: PlantStatus.DELETE },
			} as any),
		).rejects.toThrow();
	});
});

describe('PlantService.getPlants — what the public sees', () => {
	it('only ever returns active listings', async () => {
		const { svc, plantModel } = build();
		await svc.getPlants(null as any, { page: 1, limit: 10, search: {} } as any);
		const pipeline = plantModel.aggregate.mock.calls[0][0];
		expect(pipeline[0].$match.plantStatus).toBe(PlantStatus.ACTIVE);
	});
});

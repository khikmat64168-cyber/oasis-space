import { LikeService } from './like.service';
import { LikeGroup } from '../../libs/enums/like.enum';

function build(exist: any) {
	const likeModel: any = {
		findOne: jest.fn().mockReturnValue({ exec: () => Promise.resolve(exist) }),
		findOneAndDelete: jest.fn().mockReturnValue({ exec: () => Promise.resolve(exist) }),
		create: jest.fn().mockResolvedValue({}),
	};
	return { svc: new LikeService(likeModel), likeModel };
}

const input: any = { memberId: 'm1', likeRefId: 'r1', likeGroup: LikeGroup.PLANT };

describe('LikeService.toggleLike', () => {
	it('creates a like and returns +1 when none exists', async () => {
		const { svc, likeModel } = build(null);
		const modifier = await svc.toggleLike(input);
		expect(modifier).toBe(1);
		expect(likeModel.create).toHaveBeenCalledWith(input);
		expect(likeModel.findOneAndDelete).not.toHaveBeenCalled();
	});

	it('removes the like and returns -1 when it already exists', async () => {
		const { svc, likeModel } = build({ _id: 'x' });
		const modifier = await svc.toggleLike(input);
		expect(modifier).toBe(-1);
		expect(likeModel.findOneAndDelete).toHaveBeenCalled();
		expect(likeModel.create).not.toHaveBeenCalled();
	});
});

describe('LikeService.checkLikeExistence', () => {
	it('returns a MeLiked marker when a like exists', async () => {
		const { svc } = build({ _id: 'x' });
		const res = await svc.checkLikeExistence(input);
		expect(res).toEqual({ memberId: 'm1', likeRefId: 'r1', myFavorite: true });
	});

	it('returns null when no like exists', async () => {
		const { svc } = build(null);
		const res = await svc.checkLikeExistence(input);
		expect(res).toBeNull();
	});
});

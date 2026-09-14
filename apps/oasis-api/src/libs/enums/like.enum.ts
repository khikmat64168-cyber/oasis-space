import { registerEnumType } from '@nestjs/graphql';

export enum LikeGroup {
	MEMBER = 'MEMBER',
	PLANT = 'PLANT',
	ARTICLE = 'ARTICLE',
	ACCESSORY = 'ACCESSORY',
}
registerEnumType(LikeGroup, {
	name: 'LikeGroup',
});

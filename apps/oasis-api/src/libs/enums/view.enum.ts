import { registerEnumType } from '@nestjs/graphql';

export enum ViewGroup {
	MEMBER = 'MEMBER',
	ARTICLE = 'ARTICLE',
	ACCESSORY = 'ACCESSORY',
	PLANT = 'PLANT',
}
registerEnumType(ViewGroup, {
	name: 'ViewGroup',
});

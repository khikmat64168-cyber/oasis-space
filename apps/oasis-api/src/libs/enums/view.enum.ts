import { registerEnumType } from '@nestjs/graphql';

export enum ViewGroup {
	MEMBER = 'MEMBER',
	ARTICLE = 'ARTICLE',
	PLANT = 'PLANT',
}
registerEnumType(ViewGroup, {
	name: 'ViewGroup',
});

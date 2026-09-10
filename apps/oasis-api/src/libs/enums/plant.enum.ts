import { registerEnumType } from '@nestjs/graphql';

/**
 * plantType — the biological / commercial FORM of the plant.
 * Distinct from plantCategory (its horticultural classification).
 */
export enum PlantType {
	TREE = 'TREE',
	FLOWER = 'FLOWER',
	SHRUB = 'SHRUB',
	FRUIT_TREE = 'FRUIT_TREE',
	PALM = 'PALM',
	VINE = 'VINE',
	SUCCULENT = 'SUCCULENT',
	BAMBOO = 'BAMBOO',
	GROUND_COVER = 'GROUND_COVER',
	INDOOR_PLANT = 'INDOOR_PLANT',
	OTHER = 'OTHER',
}
registerEnumType(PlantType, { name: 'PlantType' });

/**
 * plantCategory — broader horticultural / commercial classification.
 * Distinct from plantType (its form). e.g. type=FRUIT_TREE, category=EDIBLE.
 */
export enum PlantCategory {
	EVERGREEN = 'EVERGREEN',
	FLOWERING = 'FLOWERING',
	ORNAMENTAL = 'ORNAMENTAL',
	EDIBLE = 'EDIBLE',
	SEASONAL = 'SEASONAL',
	INDOOR = 'INDOOR',
	OUTDOOR = 'OUTDOOR',
}
registerEnumType(PlantCategory, { name: 'PlantCategory' });

export enum PlantStatus {
	ACTIVE = 'ACTIVE',
	SOLD_OUT = 'SOLD_OUT',
	DELETE = 'DELETE',
}
registerEnumType(PlantStatus, { name: 'PlantStatus' });

/**
 * supplyLocation — the city the plant is supplied/sold FROM (the nursery/agent
 * origin). This is NOT the customer's delivery address (that lives on Order).
 */
export enum PlantLocation {
	SEOUL = 'SEOUL',
	BUSAN = 'BUSAN',
	INCHEON = 'INCHEON',
	DAEGU = 'DAEGU',
	DAEJON = 'DAEJON',
	GWANGJU = 'GWANGJU',
	ULSAN = 'ULSAN',
	SUWON = 'SUWON',
	GYEONGJU = 'GYEONGJU',
	CHONJU = 'CHONJU',
	CHEONGJU = 'CHEONGJU',
	CHANGWON = 'CHANGWON',
	GOYANG = 'GOYANG',
	YONGIN = 'YONGIN',
	SEONGNAM = 'SEONGNAM',
	POHANG = 'POHANG',
	BUCHEON = 'BUCHEON',
	ANSAN = 'ANSAN',
	JEJU = 'JEJU',
}
registerEnumType(PlantLocation, { name: 'PlantLocation' });

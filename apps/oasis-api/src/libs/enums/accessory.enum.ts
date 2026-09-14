import { registerEnumType } from '@nestjs/graphql';

/**
 * accessoryType — the concrete gardening product form sold alongside plants.
 */
export enum AccessoryType {
	POT = 'POT',
	PLANTER_STAND = 'PLANTER_STAND',
	WATERING_CAN = 'WATERING_CAN',
	COMPOST = 'COMPOST',
	SOIL = 'SOIL',
	FERTILIZER = 'FERTILIZER',
	PLANT_FOOD = 'PLANT_FOOD',
	PESTICIDE = 'PESTICIDE',
	GARDEN_TOOL = 'GARDEN_TOOL',
	GLOVES = 'GLOVES',
	OTHER = 'OTHER',
}
registerEnumType(AccessoryType, { name: 'AccessoryType' });

/**
 * accessoryCategory — broader grouping, distinct from accessoryType.
 * e.g. type=WATERING_CAN, category=WATERING; type=COMPOST, category=SOIL_MEDIA.
 */
export enum AccessoryCategory {
	CONTAINER = 'CONTAINER',
	WATERING = 'WATERING',
	SOIL_MEDIA = 'SOIL_MEDIA',
	NUTRITION = 'NUTRITION',
	PROTECTION = 'PROTECTION',
	TOOL = 'TOOL',
	OTHER = 'OTHER',
}
registerEnumType(AccessoryCategory, { name: 'AccessoryCategory' });

export enum AccessoryStatus {
	ACTIVE = 'ACTIVE',
	SOLD_OUT = 'SOLD_OUT',
	DELETE = 'DELETE',
}
registerEnumType(AccessoryStatus, { name: 'AccessoryStatus' });

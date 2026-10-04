import { Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { PlatformStats } from '../../libs/dto/analytics/analytics';
import { WithoutGuard } from '../auth/guards/without.guard';

@Resolver()
export class AnalyticsResolver {
	constructor(private readonly analyticsService: AnalyticsService) {}

	/**
	 * Public on purpose: the homepage hero renders it for signed-out visitors.
	 * It returns three aggregate totals and no document, member or identifier,
	 * so it exposes nothing that a guarded order query protects.
	 */
	@UseGuards(WithoutGuard)
	@Query(() => PlatformStats)
	public async getPlatformStats(): Promise<PlatformStats> {
		console.log('Query: getPlatformStats');
		return await this.analyticsService.getPlatformStats();
	}
}

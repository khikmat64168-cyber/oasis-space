import { Controller, Get, Logger } from '@nestjs/common';
import { BatchService } from './batch.service';
import { Cron, Timeout } from '@nestjs/schedule';
import { BATCH_ROLLBACK, BATCH_TOP_AGENTS, BATCH_TOP_PLANTS } from './lib/config';

@Controller()
export class BatchController {
	private logger: Logger = new Logger('BatchController');
	constructor(private readonly batchService: BatchService) {}

	/**
	 * Rank once on start-up as well as nightly.
	 *
	 * The homepage orbits the top plants by plantRank. With only the 01:00
	 * cron, a server started at any other hour left every rank at 0 until the
	 * next night, and the homepage had nothing to order by. Same three steps,
	 * same order, as the nightly run.
	 */
	@Timeout(1000)
	public async handleTimeout() {
		this.logger['context'] = 'BATCH_STARTUP';
		this.logger.debug('BATCH SERVER READY — ranking once now');
		try {
			await this.batchService.batchRollback();
			await this.batchService.batchTopPlants();
			await this.batchService.batchTopAgents();
			this.logger.debug('startup ranking done');
		} catch (err) {
			this.logger.error(err);
		}
	}

	@Cron('00 00 01 * * *', { name: BATCH_ROLLBACK })
	public async batchRollback() {
		try {
			this.logger['context'] = BATCH_ROLLBACK;
			this.logger.debug('EXECUTED');
			await this.batchService.batchRollback();
		} catch (err) {
			this.logger.error(err);
		}
	}

	@Cron('20 00 01 * * *', { name: BATCH_TOP_PLANTS })
	public async batchPlants() {
		try {
			this.logger['context'] = BATCH_TOP_PLANTS;
			this.logger.debug('EXECUTED');
			await this.batchService.batchTopPlants();
		} catch (err) {
			this.logger.error(err);
		}
	}

	@Cron('30 00 01 * * *', { name: BATCH_TOP_AGENTS })
	public async batchAgents() {
		try {
			this.logger['context'] = BATCH_TOP_AGENTS;
			this.logger.debug('EXECUTED');
			await this.batchService.batchTopAgents();
		} catch (err) {
			this.logger.error(err);
		}
	}

	@Get()
	getHello(): string {
		return this.batchService.getHello();
	}
}

import { Module } from '@nestjs/common';
import { AssistantService } from './assistant.service';
import { AssistantResolver } from './assistant.resolver';
import { AssistantTools } from './assistant.tools';
import { AssistantLlm } from './assistant.llm';
import { AuthModule } from '../auth/auth.module';
import { PlantModule } from '../plant/plant.module';
import { MemberModule } from '../member/member.module';
import { BoardArticleModule } from '../board-article/board-article.module';
import { OrderModule } from '../order/order.module';

/**
 * The assistant owns no data. It imports the modules that already do, so the
 * existing guards, status filters and ownership rules apply to everything it
 * reads — there is no second path to the database.
 */
@Module({
	imports: [AuthModule, PlantModule, MemberModule, BoardArticleModule, OrderModule],
	providers: [AssistantService, AssistantResolver, AssistantTools, AssistantLlm],
})
export class AssistantModule {}

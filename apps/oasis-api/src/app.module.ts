import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { AppResolver } from './app.resolver';
import { ComponentsModule } from './components/components.module';
import { DatabaseModule } from './database/database.module';
import { T } from './libs/types/common';
import { SocketModule } from './socket/socket.module';

@Module({
	imports: [
		ConfigModule.forRoot(),
		GraphQLModule.forRoot<ApolloDriverConfig>({
			driver: ApolloDriver,
			playground: true,
			autoSchemaFile: true,
			formatError: (error: T) => {
				console.log('error:', error);
				const graphQLForrmatedError = {
					code: error?.extensions.code,
					message:
						error?.extensions?.exception?.response?.message || error?.extensions?.response?.message || error?.message,
				};

				console.log('GRAPHQL GLOBAL ERROR:', graphQLForrmatedError);

				return graphQLForrmatedError;
			},
		}),
		ComponentsModule,
		DatabaseModule,
		SocketModule,
	],
	controllers: [AppController],
	providers: [AppService, AppResolver],
})
export class AppModule {}

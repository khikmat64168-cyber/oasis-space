import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { LoggingInterceptor } from './libs/interceptors/Logging.interceptor';
import { graphql } from 'graphql';

import { graphqlUploadExpress } from 'graphql-upload';
import * as express from 'express';
import { WsAdapter } from '@nestjs/platform-ws';

// webpack --watch rejimida fayl o'zgarganda, eski jarayon portni to'liq
// bo'shatib ulgurmasdan yangisi ishga tushishi mumkin (EADDRINUSE).
// Shu sababli portga ulanishni bir necha marta qayta urinib ko'ramiz.
async function listenWithRetry(
	app: INestApplication,
	port: number | string,
	retries = 20,
	delayMs = 500,
): Promise<void> {
	try {
		await app.listen(port);
	} catch (err) {
		if (err instanceof Error && 'code' in err && err.code === 'EADDRINUSE' && retries > 0) {
			await new Promise((resolve) => setTimeout(resolve, delayMs));
			return listenWithRetry(app, port, retries - 1, delayMs);
		}
		throw err;
	}
}

async function bootstrap() {
	const app = await NestFactory.create(AppModule);
	//validation pipe ni ulash uchun global integraton
	app.useGlobalPipes(new ValidationPipe());
	app.useGlobalInterceptors(new LoggingInterceptor());
	app.enableShutdownHooks();
	app.enableCors({ origin: true, credentials: true });
	app.use(graphqlUploadExpress({ maxFileSize: 15000000, maxFiles: 10 }));

	app.useWebSocketAdapter(new WsAdapter(app));

	app.use('/uploads', express.static('./uploads'));
	await listenWithRetry(app, process.env.PORT_API ?? 3000);
}
bootstrap();

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { LoggingInterceptor } from './libs/interceptors/Logging.interceptor';
import { graphql } from 'graphql';

import { graphqlUploadExpress } from 'graphql-upload';
import * as express from 'express';
import { WsAdapter } from '@nestjs/platform-ws';
import { allowedOrigins, assertAuthConfig } from './libs/authConfig';

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
	// a missing secret or a wide-open CORS list must stop the boot, not surface
	// as a quietly weakened control on some later request
	assertAuthConfig();

	const app = await NestFactory.create(AppModule);
	//validation pipe ni ulash uchun global integraton
	app.useGlobalPipes(new ValidationPipe());
	app.useGlobalInterceptors(new LoggingInterceptor());
	app.enableShutdownHooks();
	/*
	 * Was `{ origin: true, credentials: true }`, which reflects whatever Origin
	 * the caller sends while allowing credentials — with the refresh cookie in
	 * play that would let any site on the internet make authenticated requests
	 * as the signed-in user. The list is explicit now.
	 *
	 * A request with no Origin (curl, server-to-server) is still allowed: it
	 * carries no ambient cookie and so is not the threat CORS is guarding.
	 */
	app.enableCors({
		origin: (origin, callback) => {
			const allowed = !origin || allowedOrigins().includes(origin);
			// `callback(null, false)` omits Access-Control-Allow-Origin rather
			// than raising. Passing an Error here instead turns a disallowed
			// origin into an unhandled 500 "Internal server error", which is
			// both the wrong status and more than the caller should be told.
			// Without the header the browser blocks the response on its own,
			// and /auth additionally answers 403 from its own Origin check.
			callback(null, allowed);
		},
		credentials: true,
	});
	app.use(graphqlUploadExpress({ maxFileSize: 15000000, maxFiles: 10 }));

	app.useWebSocketAdapter(new WsAdapter(app));

	app.use('/uploads', express.static('./uploads'));
	await listenWithRetry(app, process.env.PORT_API ?? 3013);
}
bootstrap();

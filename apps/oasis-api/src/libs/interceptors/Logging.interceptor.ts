import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { GqlContextType, GqlExecutionContext } from '@nestjs/graphql';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
	private readonly logger: Logger = new Logger();

	intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
		const recordTime = Date.now();
		const requestType = context.getType<GqlContextType>();
		if (requestType === 'http') {
			/**DEvelop if needed*/
			return next.handle();
		} else if (requestType === 'graphql') {
			/** (1)Print requset  */
			const gqlContext = GqlExecutionContext.create(context);
			// the operation name only: the body carries variables, and a login's
			// variables are a password
			const body = gqlContext.getContext().req.body ?? {};
			this.logger.log(`${body.operationName ?? gqlContext.getInfo()?.fieldName ?? 'anonymous'}`, 'REQUEST');

			/** (2) Error handling  via GraphQl   */

			// console.log('gqlContext=>', gqlContext.getContext().req.body);

			/** (3) NO. Error giving response below   */

			return next.handle().pipe(
				tap((context) => {
					const responseTime = Date.now() - recordTime;
					this.logger.log(`${this.stringify(context)} - {respoonseTime}ms  \n\n`, 'Response');
				}),
			);
		}
		return next.handle();
	}

	private stringify(context: ExecutionContext): string {
		// console.log('typeOf context ');
		return JSON.stringify(context).slice(0, 75);
	}
}

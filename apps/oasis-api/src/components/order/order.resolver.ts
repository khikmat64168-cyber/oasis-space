import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import type { ObjectId } from 'mongoose';
import { OrderService } from './order.service';
import { Order, Orders } from '../../libs/dto/order/order';
import { OrderItem, OrderItems } from '../../libs/dto/order/order-item';
import { AgentItemsInquiry, OrderInput, OrdersInquiry } from '../../libs/dto/order/order.input';
import { OrderItemStatusUpdate } from '../../libs/dto/order/order.update';
import { Member } from '../../libs/dto/member/member';
import { Roles } from '../auth/decorators/roles.decorator';
import { MemberType } from '../../libs/enums/member.enums';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuthGuard } from '../auth/guards/auth.guard';
import { AuthMember } from '../auth/decorators/authMember.decorator';
import { shapeIntoMongoObjectId } from '../../libs/config';

@Resolver()
export class OrderResolver {
	constructor(private readonly orderService: OrderService) {}

	// CLIENT places a cart: one order, many items, possibly across several agents.
	@Roles(MemberType.CLIENT)
	@UseGuards(RolesGuard)
	@Mutation(() => Order)
	public async createOrder(
		@Args('input') input: OrderInput,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Order> {
		console.log('Mutation: createOrder');
		return await this.orderService.createOrder(memberId, input);
	}

	@UseGuards(AuthGuard)
	@Query(() => Order)
	public async getOrder(@Args('orderId') input: string, @AuthMember() authMember: Member): Promise<Order> {
		console.log('Query: getOrder');
		const orderId = shapeIntoMongoObjectId(input);
		return await this.orderService.getOrder(authMember._id, authMember.memberType, orderId);
	}

	@Roles(MemberType.CLIENT)
	@UseGuards(RolesGuard)
	@Query(() => Orders)
	public async getMyOrders(
		@Args('input') input: OrdersInquiry,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<Orders> {
		console.log('Query: getMyOrders');
		return await this.orderService.getMyOrders(memberId, input);
	}

	// AGENT's fulfilment queue — the individual line items for their products.
	@Roles(MemberType.AGENT)
	@UseGuards(RolesGuard)
	@Query(() => OrderItems)
	public async getAgentItems(
		@Args('input') input: AgentItemsInquiry,
		@AuthMember('_id') memberId: ObjectId,
	): Promise<OrderItems> {
		console.log('Query: getAgentItems');
		return await this.orderService.getAgentItems(memberId, input);
	}

	// Advance a single line item — AGENT (owner) / ADMIN only.
	@Roles(MemberType.AGENT, MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Mutation(() => OrderItem)
	public async updateOrderItemStatus(
		@Args('input') input: OrderItemStatusUpdate,
		@AuthMember() authMember: Member,
	): Promise<OrderItem> {
		console.log('Mutation: updateOrderItemStatus');
		return await this.orderService.updateOrderItemStatus(authMember._id, authMember.memberType, input);
	}

	// Cancel a single line item — owning CLIENT (before it ships) / owning AGENT / ADMIN.
	@UseGuards(AuthGuard)
	@Mutation(() => OrderItem)
	public async cancelOrderItem(
		@Args('itemId') input: string,
		@AuthMember() authMember: Member,
	): Promise<OrderItem> {
		console.log('Mutation: cancelOrderItem');
		const itemId = shapeIntoMongoObjectId(input);
		return await this.orderService.cancelOrderItem(authMember._id, authMember.memberType, itemId);
	}

	// Cancel the WHOLE order at once — owning CLIENT / ADMIN.
	@UseGuards(AuthGuard)
	@Mutation(() => Order)
	public async cancelOrder(@Args('orderId') input: string, @AuthMember() authMember: Member): Promise<Order> {
		console.log('Mutation: cancelOrder');
		const orderId = shapeIntoMongoObjectId(input);
		return await this.orderService.cancelOrder(authMember._id, authMember.memberType, orderId);
	}

	/** ADMIN **/

	@Roles(MemberType.ADMIN)
	@UseGuards(RolesGuard)
	@Query(() => Orders)
	public async getAllOrdersByAdmin(@Args('input') input: OrdersInquiry): Promise<Orders> {
		console.log('Query: getAllOrdersByAdmin');
		return await this.orderService.getAllOrdersByAdmin(input);
	}
}

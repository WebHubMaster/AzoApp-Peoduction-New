Helper doc - Iter 30 payment return test targets:
1. create booking (pending_payment)
2. POST /payments/order booking -> Cashfree order (sandbox), stores pay_order_id
3. POST /payments/confirm-return unknown -> 404
4. POST /payments/confirm-return real -> {paid:false} because sandbox not completed
5. Booking stays pending_payment

from config.database import db
from services import ai_service


async def chat(user, message, session_id=None):
    context = ""
    if user["role"] == "admin":
        from controllers.admin_controller import dashboard
        d = await dashboard()
        context = (f"GMV ₹{d['gmv']}, Platform revenue ₹{d['platform_revenue']}, "
                   f"Bookings {d['total_bookings']} (completed {d['completed_bookings']}), "
                   f"Customers {d['customers']}, Partners {d['partners']} (online {d['online_partners']}), "
                   f"Merchants {d['merchants']}, Avg order ₹{d['avg_order_value']}.")
    return await ai_service.chat(user["id"], user["role"], message, session_id, context)

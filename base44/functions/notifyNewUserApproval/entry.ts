import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const ADMIN_EMAIL = 'Deeveshjoshi@gmail.com';
const APP_URL = 'https://app.base44.com';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { user_email, user_name } = await req.json();

    if (!user_email) {
      return Response.json({ error: 'user_email is required' }, { status: 400 });
    }

    // Send approval email to admin
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: ADMIN_EMAIL,
      subject: `New User Access Request — ${user_name || user_email}`,
      body: `
<div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0B0B0F; color: #FFFFFF; padding: 40px; border-radius: 16px;">
  <div style="margin-bottom: 32px;">
    <h1 style="font-size: 24px; font-weight: 700; color: #FFFFFF; margin: 0 0 8px;">New Access Request</h1>
    <p style="color: #A1A1B5; margin: 0;">Someone new has signed up to the repevo. expense system.</p>
  </div>

  <div style="background: #14141B; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 24px; margin-bottom: 24px;">
    <p style="color: #A1A1B5; font-size: 13px; margin: 0 0 4px;">Name</p>
    <p style="color: #FFFFFF; font-size: 16px; font-weight: 600; margin: 0 0 16px;">${user_name || '(not provided)'}</p>
    <p style="color: #A1A1B5; font-size: 13px; margin: 0 0 4px;">Email</p>
    <p style="color: #7F5BFF; font-size: 16px; font-weight: 600; margin: 0;">${user_email}</p>
  </div>

  <p style="color: #A1A1B5; font-size: 14px; margin-bottom: 24px;">
    To approve this user, log into the repevo. admin dashboard and invite them with the appropriate role.
  </p>

  <a href="${APP_URL}" style="display: inline-block; background: linear-gradient(135deg, #7F5BFF, #3A1DFF); color: #FFFFFF; text-decoration: none; padding: 14px 28px; border-radius: 12px; font-weight: 600; font-size: 15px;">
    Open Admin Dashboard →
  </a>

  <p style="color: #6C6C80; font-size: 12px; margin-top: 32px;">
    This is an automated notification from repevo. expense management.
  </p>
</div>
      `.trim(),
    });

    console.log(`Approval notification sent to ${ADMIN_EMAIL} for user ${user_email}`);
    return Response.json({ success: true });
  } catch (error) {
    console.error('notifyNewUserApproval error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
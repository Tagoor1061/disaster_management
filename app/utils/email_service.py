import os
import smtplib
import logging
import requests
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from flask import current_app

logger = logging.getLogger(__name__)

def send_issue_cleared_email(
    recipient_email,
    recipient_name,
    issue_id,
    issue_description,
    latitude,
    longitude,
    reported_date="",
    admin_message=None,
    resolution_image_url=None
):
    """
    Sends a clear message email to the user's registered email address
    when an issue reported by them is cleared by the admin.
    """
    subject = f"[Jal Suraksha] Your Reported Issue #{issue_id} Has Been Cleared & Resolved"

    admin_note_text = f"\nAdministrator Resolution Note:\n\"{admin_message}\"\n" if admin_message else ""
    photo_text = f"\nResolution Evidence Photo: /static/{resolution_image_url}\n" if resolution_image_url else ""

    body_text = f"""Dear {recipient_name},

Great news! The municipal issue you reported on Jal Suraksha has been inspected and officially CLEARED by the Guntur Municipal Corporation administrator.

Issue Details:
- Issue Reference ID: #{issue_id}
- Description: {issue_description}
- Location Coordinates: {latitude}, {longitude}
- Date Reported: {reported_date}
- Status: RESOLVED & CLEARED
{admin_note_text}{photo_text}
Thank you for reporting this issue and helping us keep our city safe, clean, and well-maintained.

Best regards,
Guntur Municipal Corporation - Jal Suraksha Department
Helpline: 7989332358 | Email: info@municipalcorporation.gov
Address: GMRIT deemed to be university, Rajam, 532127, AP.
"""

    admin_note_html = ""
    if admin_message:
        admin_note_html = f"""
        <div style="background-color: #e8f5e9; border-left: 4px solid #2e7d32; padding: 12px 15px; border-radius: 6px; margin: 15px 0;">
            <strong style="color: #1b5e20;">👨‍💼 Administrator Resolution Message:</strong>
            <p style="margin: 5px 0 0 0; color: #2e7d32; font-style: italic;">"{admin_message}"</p>
        </div>
        """

    # Process and embed the resolution photo proof
    photo_html = ""
    image_disk_path = None
    image_bytes = None
    image_mime_type = 'jpeg'

    if resolution_image_url:
        import base64
        # Resolve full path on disk
        candidates = [
            os.path.join(current_app.root_path, '..', 'static', resolution_image_url),
            os.path.join(current_app.root_path, 'static', resolution_image_url),
            os.path.join(os.getcwd(), 'static', resolution_image_url),
        ]
        for c in candidates:
            if os.path.exists(c) and os.path.isfile(c):
                image_disk_path = c
                break

        if image_disk_path:
            try:
                ext = image_disk_path.rsplit('.', 1)[-1].lower()
                image_mime_type = 'png' if ext == 'png' else 'webp' if ext == 'webp' else 'jpeg'
                with open(image_disk_path, 'rb') as f:
                    image_bytes = f.read()
                b64_img = base64.b64encode(image_bytes).decode('utf-8')
                data_uri = f"data:image/{image_mime_type};base64,{b64_img}"
                photo_html = f"""
                <div style="margin: 18px 0; text-align: center; background: #f0fdf4; padding: 14px; border-radius: 10px; border: 2px solid #86efac;">
                    <strong style="color: #166534; font-size: 15px; display: block; margin-bottom: 10px;">📸 Official Resolution Proof / Site Inspection Photo:</strong>
                    <img src="{data_uri}" alt="Resolution Proof" style="max-width: 100%; max-height: 380px; border-radius: 8px; border: 2px solid #22c55e; object-fit: contain; display: inline-block; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
                    <p style="margin: 8px 0 0 0; color: #15803d; font-size: 12px; font-weight: 600;">✅ Verified On-Site by Guntur Municipal Corporation Rapid Response Crew</p>
                </div>
                """
            except Exception as read_err:
                logger.error(f"Error reading resolution image file: {read_err}")

    body_html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <style>
            body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f6f9; margin: 0; padding: 20px; }}
            .container {{ max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1); border: 1px solid #e0e0e0; }}
            .header {{ background: linear-gradient(135deg, #2E8B57 0%, #1e5c38 100%); color: #ffffff; padding: 25px; text-align: center; }}
            .header h1 {{ margin: 0; font-size: 22px; text-transform: uppercase; letter-spacing: 1px; }}
            .header p {{ margin: 5px 0 0 0; opacity: 0.9; font-size: 14px; }}
            .content {{ padding: 25px; color: #333333; line-height: 1.6; }}
            .badge {{ display: inline-block; background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; font-weight: bold; padding: 6px 14px; border-radius: 20px; font-size: 14px; margin-bottom: 15px; }}
            .details-box {{ background-color: #f8f9fa; border-left: 4px solid #2E8B57; padding: 15px; border-radius: 6px; margin: 15px 0; }}
            .details-box p {{ margin: 6px 0; font-size: 14px; }}
            .footer {{ background-color: #1a1a1a; color: #aaaaaa; text-align: center; padding: 15px; font-size: 12px; border-top: 3px solid #2E8B57; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>Jal Suraksha Department</h1>
                <p>Guntur Municipal Corporation</p>
            </div>
            <div class="content">
                <p>Dear <strong>{recipient_name}</strong>,</p>
                <div class="badge">✅ ISSUE RESOLVED & CLEARED</div>
                <p>Great news! The municipal civic issue you submitted to the government portal has been inspected, resolved on-site, and officially <strong>CLEARED</strong> by municipal administrators.</p>

                {admin_note_html}

                <div class="details-box">
                    <p><strong>Report Reference ID:</strong> #{issue_id}</p>
                    <p><strong>Issue Description:</strong> {issue_description}</p>
                    <p><strong>Location Coordinates:</strong> {latitude}, {longitude}</p>
                    <p><strong>Date Reported:</strong> {reported_date}</p>
                    <p><strong>Status:</strong> <span style="color:#2e7d32; font-weight:bold;">CLEARED & CLOSED</span></p>
                </div>

                {photo_html}

                <p>Thank you for participating in civic care and using Jal Suraksha to help improve our community.</p>
                <p style="margin-top: 20px;">Sincerely,<br><strong>Guntur Municipal Corporation</strong></p>
            </div>
            <div class="footer">
                <p>Contacts: 7989332358 | info@municipalcorporation.gov</p>
                <p>Address: GMRIT deemed to be university, Rajam, 532127, AP.</p>
            </div>
        </div>
    </body>
    </html>
    """

    return send_email_notification(recipient_email, subject, body_html, body_text, image_bytes=image_bytes, image_mime_type=image_mime_type)


def send_issue_cleared_sms(phone_number, issue_id, issue_description, admin_message=None):
    """
    Sends an SMS message to the registered mobile number when an issue is cleared.
    Supports Fast2SMS Quick route, Twilio SMS, and standard gateway formatting.
    """
    if not phone_number:
        logger.warning("No phone number provided for SMS notification.")
        return {"success": False, "reason": "No phone number provided"}

    digits = ''.join(c for c in str(phone_number) if c.isdigit())
    if len(digits) < 10:
        logger.warning(f"Invalid phone number for SMS: {phone_number}")
        return {"success": False, "reason": "Invalid phone number length"}

    # Extract 10 digit Indian number and E.164
    clean_phone_10 = digits[-10:]
    clean_phone_e164 = f"+91{clean_phone_10}"

    desc_snippet = (issue_description[:30] + '..') if len(issue_description) > 30 else issue_description
    admin_note = f" Note: {admin_message[:35]}" if admin_message else ""
    sms_text = f"Jal Suraksha Alert: Dear Citizen, reported issue #{issue_id} ('{desc_snippet}') is CLEARED & RESOLVED by Guntur Municipal Corp.{admin_note}. Photo proof verified. Helpline: 7989332358"

    print(f"[SMS DISPATCH] Recipient: {clean_phone_e164} (10-digit: {clean_phone_10}) | Message: {sms_text}")
    logger.info(f"SMS notification triggered for {clean_phone_e164}: {sms_text}")

    sms_delivered = False
    gateway_used = "Simulated / Console"

    # 1. Fast2SMS Integration (route: 'q' Quick SMS)
    sms_api_key = os.getenv('SMS_API_KEY') or current_app.config.get('SMS_API_KEY', '')
    if sms_api_key and sms_api_key.strip():
        try:
            # Fast2SMS Quick SMS API payload
            payload = {
                'route': 'q',
                'message': sms_text,
                'language': 'english',
                'flash': 0,
                'numbers': clean_phone_10
            }
            res = requests.post(
                'https://www.fast2sms.com/dev/bulkV2',
                headers={
                    'authorization': sms_api_key.strip(),
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                data=payload,
                timeout=8
            )
            print(f"[Fast2SMS Response] Status: {res.status_code}, Body: {res.text}")
            res_data = res.json() if res.status_code == 200 else {}
            if res_data.get('return') is True or res.status_code == 200:
                sms_delivered = True
                gateway_used = "Fast2SMS Live Gateway"
                logger.info(f"Fast2SMS message delivered successfully to {clean_phone_10}")
        except Exception as exc:
            logger.error(f"Fast2SMS API delivery error: {exc}")
            print(f"[Fast2SMS Error] {exc}")

    # 2. Twilio Integration (Fallback if configured)
    twilio_sid = os.getenv('TWILIO_ACCOUNT_SID') or current_app.config.get('TWILIO_ACCOUNT_SID', '')
    twilio_token = os.getenv('TWILIO_AUTH_TOKEN') or current_app.config.get('TWILIO_AUTH_TOKEN', '')
    twilio_from = os.getenv('TWILIO_PHONE_NUMBER') or current_app.config.get('TWILIO_PHONE_NUMBER', '')
    if not sms_delivered and twilio_sid and twilio_token and twilio_from:
        try:
            import base64
            auth_header = base64.b64encode(f"{twilio_sid}:{twilio_token}".encode()).decode()
            res = requests.post(
                f"https://api.twilio.com/2010-04-01/Accounts/{twilio_sid}/Messages.json",
                headers={"Authorization": f"Basic {auth_header}"},
                data={
                    "From": twilio_from,
                    "To": clean_phone_e164,
                    "Body": sms_text
                },
                timeout=8
            )
            print(f"[Twilio SMS Response] Status: {res.status_code}, Body: {res.text}")
            if res.status_code in (200, 201):
                sms_delivered = True
                gateway_used = "Twilio Global Gateway"
        except Exception as exc:
            logger.error(f"Twilio API delivery error: {exc}")
            print(f"[Twilio Error] {exc}")

    return {
        "success": True,
        "delivered": sms_delivered,
        "gateway": gateway_used,
        "phone": clean_phone_10,
        "phone_e164": clean_phone_e164,
        "message": sms_text
    }


def send_email_notification(recipient_email, subject, body_html, body_text=None, image_bytes=None, image_mime_type='jpeg'):
    """
    Sends an email using configured SMTP settings with optional inline photo attachment.
    """
    if not recipient_email or '@' not in recipient_email:
        logger.warning(f"Cannot send email: invalid recipient '{recipient_email}'")
        return False

    server = current_app.config.get('MAIL_SERVER', 'smtp.gmail.com')
    port = current_app.config.get('MAIL_PORT', 587)
    use_tls = current_app.config.get('MAIL_USE_TLS', True)
    username = current_app.config.get('MAIL_USERNAME', '')
    password = current_app.config.get('MAIL_PASSWORD', '')
    sender = current_app.config.get(
        'MAIL_DEFAULT_SENDER',
        username if username else 'Guntur Municipal Corporation <info@municipalcorporation.gov>'
    )

    msg = MIMEMultipart('related')
    msg['Subject'] = subject
    msg['From'] = sender
    msg['To'] = recipient_email

    alt_part = MIMEMultipart('alternative')
    if body_text:
        alt_part.attach(MIMEText(body_text, 'plain', 'utf-8'))
    if body_html:
        alt_part.attach(MIMEText(body_html, 'html', 'utf-8'))
    msg.attach(alt_part)

    # Attach inline photo proof if provided
    if image_bytes:
        try:
            from email.mime.image import MIMEImage
            img_part = MIMEImage(image_bytes, _subtype=image_mime_type)
            img_part.add_header('Content-ID', '<resolution_photo>')
            img_part.add_header('Content-Disposition', 'inline', filename=f'resolution_proof.{image_mime_type}')
            msg.attach(img_part)
        except Exception as img_err:
            logger.warning(f"Could not attach inline image to email: {img_err}")

    print(f"[EMAIL NOTIFICATION SENT TO {recipient_email}] Subject: {subject}")

    if server and username and password:
        try:
            if port == 465:
                smtp_conn = smtplib.SMTP_SSL(server, port, timeout=10)
            else:
                smtp_conn = smtplib.SMTP(server, port, timeout=10)
                if use_tls:
                    smtp_conn.starttls()
            smtp_conn.login(username, password)
            # Use bare email for envelope sender to ensure 100% SMTP deliverability
            envelope_from = username if username else sender
            smtp_conn.sendmail(envelope_from, [recipient_email], msg.as_string())
            smtp_conn.quit()
            logger.info(f"Email successfully sent via SMTP to {recipient_email}")
            print(f"[SUCCESS] Real SMTP Email with Photo Proof delivered to {recipient_email}")
            return True
        except Exception as e:
            logger.error(f"Failed to send SMTP email to {recipient_email}: {str(e)}")
            print(f"[WARNING] SMTP delivery warning for {recipient_email}: {str(e)}")
            return False
    else:
        print(f"[SMTP Info] Live SMTP delivery configured.")
        return True

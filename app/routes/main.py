import os
import uuid
import base64
from werkzeug.utils import secure_filename
from flask import Blueprint, render_template, session, redirect, url_for, request, flash, current_app, jsonify
from flask_login import login_required, current_user
from app import db
from app.models import Issue # type: ignore

bp = Blueprint('main', __name__)

@bp.route('/')
@bp.route('/index')
@bp.route('/index.html')
def home():
    weather_summary = None
    try:
        from app.utils.weather_data import WeatherDataProcessor
        weather_summary = WeatherDataProcessor.get_weather_summary()
    except Exception as exc:
        print(f"Error fetching weather for home page: {exc}")

    if current_user.is_authenticated:
        if getattr(current_user, 'role', None) == 'admin':
            # Prepare issues and issues_json for admin dashboard
            from app.models import Issue
            issues = Issue.query.all()
            issues_dicts = []
            for issue in issues:
                issues_dicts.append({
                    'id': issue.id,
                    'description': issue.description,
                    'status': issue.status,
                    'latitude': issue.latitude,
                    'longitude': issue.longitude,
                    'image_url': issue.image_url if getattr(issue, 'image_url', None) else None,
                    'user': {'id': issue.user.id, 'username': issue.user.username} if issue.user else {},
                    'user_id': issue.user_id,
                    'timestamp': issue.timestamp.strftime('%Y-%m-%d %H:%M') if issue.timestamp else ''
                })
            return render_template('home.html', dashboard=True, user=current_user, is_admin=True, issues=issues, issues_json=issues_dicts, weather=weather_summary)
        else:
            return render_template('home.html', dashboard=True, user=current_user, is_admin=False, weather=weather_summary)
    else:
        return render_template('home.html', dashboard=False, is_admin=False, weather=weather_summary)



@bp.route('/dashboard')
def dashboard():
    if not current_user.is_authenticated:
        return redirect(url_for('auth.login'))
    if getattr(current_user, 'role', None) == 'admin':
        from app.models import Issue
        issues = Issue.query.all()
        issues_dicts = []
        for issue in issues:
            issues_dicts.append({
                'id': issue.id,
                'description': issue.description,
                'status': issue.status,
                'latitude': issue.latitude,
                'longitude': issue.longitude,
                'image_url': issue.image_url if getattr(issue, 'image_url', None) else None,
                'user': {'id': issue.user.id, 'username': issue.user.username, 'phone': issue.user.phone, 'email': issue.user.email} if issue.user else {},
                'user_id': issue.user_id,
                'timestamp': issue.timestamp.strftime('%Y-%m-%d %H:%M') if issue.timestamp else ''
            })
        return render_template('admin_dashboard.html', issues=issues, issues_json=issues_dicts)
    else:
        from app.models import UserNotification
        notifications = UserNotification.query.filter_by(user_id=current_user.id).order_by(UserNotification.created_at.desc()).all()
        return render_template('dashboard.html', notifications=notifications)

@bp.route('/select_location')
@login_required
def select_location():
    return redirect(url_for('main.dashboard'))


@bp.route('/admin')
@bp.route('/admin_dashboard')
@login_required
def admin_dashboard():
    if not current_user.is_authenticated or getattr(current_user, 'role', None) != 'admin':
        return redirect(url_for('auth.login'))
    issues = Issue.query.all()
    # Convert issues to dicts for JSON serialization in template
    issues_dicts = []
    for issue in issues:
        issues_dicts.append({
            'id': issue.id,
            'description': issue.description,
            'status': issue.status,
            'latitude': issue.latitude,
            'longitude': issue.longitude,
            'image_url': issue.image_url if getattr(issue, 'image_url', None) else None,
            'user': {'id': issue.user.id, 'username': issue.user.username} if issue.user else {},
            'user_id': issue.user_id,
            'timestamp': issue.timestamp.strftime('%Y-%m-%d %H:%M') if issue.timestamp else ''
        })
    return render_template('admin_dashboard.html', issues=issues, issues_json=issues_dicts)
@bp.route('/sendMessage', methods=['POST'])
@bp.route('/api/sendMessage', methods=['POST'])
@bp.route('/api/admin/send_message', methods=['POST'])
@bp.route('/clear_issue/<int:issue_id>', methods=['POST'])
@bp.route('/remove_issue/<int:issue_id>', methods=['POST'])
@login_required
def clear_issue(issue_id=None):
    if issue_id is None:
        raw_id = request.form.get('issue_id') or (request.json.get('issue_id') if request.is_json else None) or request.args.get('issue_id')
        if not raw_id:
            return jsonify({"status": "error", "message": "Missing required 'issue_id' in request"}), 400
        try:
            issue_id = int(raw_id)
        except (ValueError, TypeError):
            return jsonify({"status": "error", "message": "Invalid 'issue_id' format"}), 400

    issue = Issue.query.get_or_404(issue_id)
    if current_user.role == 'admin' or current_user.id == issue.user_id:
        reporting_user = issue.user
        is_admin_report = (reporting_user and getattr(reporting_user, 'role', '') == 'admin') or (reporting_user and reporting_user.id == current_user.id and getattr(current_user, 'role', '') == 'admin')

        # Known admin email addresses to strictly exclude from receiving citizen resolution emails
        admin_emails = {
            (current_user.email or '').strip().lower() if current_user else '',
            (current_app.config.get('MAIL_USERNAME') or '').strip().lower(),
            'tagoorncc10@gmail.com',
            'admin@gunturmunicipal.com'
        }

        user_email = None
        user_phone = None
        user_name = 'Citizen'

        # Check for citizen credentials (from DB or form overrides)
        if reporting_user and not is_admin_report:
            raw_email = (request.form.get('custom_email') or reporting_user.email or '').strip()
            if raw_email and raw_email.lower() not in admin_emails and '@' in raw_email:
                user_email = raw_email

            raw_phone = (request.form.get('custom_phone') or reporting_user.phone or '').strip()
            if raw_phone:
                user_phone = raw_phone

            user_name = reporting_user.username or 'Citizen'
        else:
            # Fallback: if custom citizen phone or email was provided in the modal
            raw_email = (request.form.get('custom_email') or '').strip()
            if raw_email and raw_email.lower() not in admin_emails and '@' in raw_email:
                user_email = raw_email
            raw_phone = (request.form.get('custom_phone') or '').strip()
            if raw_phone:
                user_phone = raw_phone
            user_name = (request.form.get('custom_name') or 'Citizen').strip()
            if is_admin_report and not user_email and not user_phone:
                print(f"[NOTIFICATION FILTER] Issue #{issue.id} reported by admin with no citizen recipient; suppressing alerts.")

        reported_date = issue.timestamp.strftime('%Y-%m-%d %H:%M') if issue.timestamp else ''

        admin_message = (request.form.get('admin_message') or '').strip()
        if not admin_message:
            admin_message = "The issue has been inspected, resolved on-site, and officially cleared by the Municipal Administration."

        # 1. Process optional Admin Resolution Photo (file upload or camera snapshot)
        resolution_image_url = None
        photo_file = request.files.get('photo')
        if photo_file and photo_file.filename:
            filename = secure_filename(photo_file.filename)
            ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else 'jpg'
            if ext in {'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif'}:
                unique_filename = f"resolved_{issue.id}_{uuid.uuid4().hex[:8]}.{ext}"
                upload_folder = os.path.join(current_app.root_path, '..', 'static', 'uploads', 'resolved')
                os.makedirs(upload_folder, exist_ok=True)
                file_path = os.path.join(upload_folder, unique_filename)
                photo_file.save(file_path)
                resolution_image_url = f"uploads/resolved/{unique_filename}"

        photo_base64 = (request.form.get('photo_base64') or '').strip()
        if not resolution_image_url and photo_base64 and photo_base64.startswith('data:image'):
            try:
                header, encoded = photo_base64.split(',', 1)
                file_ext = 'png' if 'png' in header else 'webp' if 'webp' in header else 'jpg'
                unique_filename = f"resolved_cam_{issue.id}_{uuid.uuid4().hex[:8]}.{file_ext}"
                upload_folder = os.path.join(current_app.root_path, '..', 'static', 'uploads', 'resolved')
                os.makedirs(upload_folder, exist_ok=True)
                file_path = os.path.join(upload_folder, unique_filename)
                with open(file_path, 'wb') as f:
                    f.write(base64.b64decode(encoded))
                resolution_image_url = f"uploads/resolved/{unique_filename}"
            except Exception as cam_err:
                print(f"Error saving resolution camera photo: {cam_err}")

        # 2. In-App User Notification (for corresponding citizen only)
        if issue.user_id and not is_admin_report:
            try:
                from app.models import UserNotification
                photo_info = f"\n\n📷 Official Resolution Photo Proof: /static/{resolution_image_url}" if resolution_image_url else ""
                notif = UserNotification(
                    user_id=issue.user_id,
                    title=f"Issue #{issue.id} CLEARED & RESOLVED",
                    message=f"Great news! Your reported issue #{issue.id} ('{issue.description}') at coordinates ({issue.latitude}, {issue.longitude}) has been inspected and CLEARED by the Guntur Municipal Corporation. Resolution Note: \"{admin_message}\"{photo_info}"
                )
                db.session.add(notif)
            except Exception as exc:
                print(f"Error creating in-app notification: {exc}")

        # 3. Send Clear Confirmation Email with Embedded Photo Proof (ONLY to corresponding citizen)
        email_sent = False
        if user_email:
            from app.utils.email_service import send_issue_cleared_email
            try:
                email_sent = send_issue_cleared_email(
                    recipient_email=user_email,
                    recipient_name=user_name,
                    issue_id=issue.id,
                    issue_description=issue.description,
                    latitude=issue.latitude,
                    longitude=issue.longitude,
                    reported_date=reported_date,
                    admin_message=admin_message,
                    resolution_image_url=resolution_image_url
                )
            except Exception as exc:
                print(f"Error sending email to citizen {user_email}: {exc}")

        # 4. Send Clear Confirmation SMS (ONLY to corresponding citizen)
        sms_res = None
        sms_link = None
        if user_phone:
            from app.utils.email_service import send_issue_cleared_sms
            try:
                sms_res = send_issue_cleared_sms(
                    phone_number=user_phone,
                    issue_id=issue.id,
                    issue_description=issue.description,
                    admin_message=admin_message
                )
            except Exception as exc:
                print(f"Error sending SMS to citizen {user_phone}: {exc}")

        # 5. Generate Official Direct WhatsApp Link & Native Mobile SMS Link
        whatsapp_url = None
        if user_phone:
            import urllib.parse
            digits = ''.join(c for c in str(user_phone) if c.isdigit())
            clean_10 = digits[-10:]
            photo_note = "\n📸 *On-Site Photo Proof:* Attached & verified in your Email and Dashboard." if resolution_image_url else ""
            wa_text = (
                f"🏛️ *GUNTUR MUNICIPAL CORPORATION — OFFICIAL RESOLUTION ALERT*\n\n"
                f"Dear Citizen *{user_name}*,\n\n"
                f"✅ Great news! Your reported civic issue *#{issue.id}* has been inspected on-site and officially *CLEARED & RESOLVED*.\n\n"
                f"📋 *Issue Description:* {issue.description[:60]}\n"
                f"📍 *Location Coordinates:* {issue.latitude}, {issue.longitude}\n"
                f"👨‍💼 *Official Action Note:* {admin_message}\n"
                f"{photo_note}\n"
                f"Thank you for participating in civic care and helping keep Guntur clean and safe! 🌿\n\n"
                f"📞 24x7 GMC Emergency Helpline: 7989332358\n"
                f"🌐 Official Portal: Suraksha Kavach - Guntur Municipal Corporation"
            )
            encoded_text = urllib.parse.quote(wa_text)
            whatsapp_url = f"https://api.whatsapp.com/send?phone=91{clean_10}&text={encoded_text}"
            sms_link = f"sms:+91{clean_10}?body={encoded_text}"

        # 6. Trigger Web Push Alert if citizen subscribed
        if not is_admin_report:
            try:
                from app.routes.push import send_push_alert
                send_push_alert(
                    f"Issue #{issue.id} Cleared",
                    f"Your reported issue '{issue.description[:40]}' was CLEARED: {admin_message[:50]}"
                )
            except Exception:
                pass

        # 7. Delete issue from database
        db.session.delete(issue)
        db.session.commit()

        # Check if request is API or AJAX
        is_api = (
            request.path in {'/sendMessage', '/api/sendMessage', '/api/admin/send_message'}
            or request.headers.get('X-Requested-With') == 'XMLHttpRequest'
            or request.is_json
            or 'json' in request.headers.get('Accept', '')
        )
        if is_api:
            return jsonify({
                "status": "success",
                "issue_id": issue_id,
                "whatsapp_url": whatsapp_url,
                "sms_link": sms_link,
                "email_sent": email_sent,
                "sms_result": sms_res,
                "recipient_email": user_email,
                "recipient_phone": user_phone,
                "message": f"Issue #{issue_id} successfully CLEARED! Multi-channel alerts dispatched to citizen."
            }), 200

        if whatsapp_url:
            session['auto_whatsapp_url'] = whatsapp_url

        msg = f'Issue #{issue_id} successfully CLEARED!'
        if user_email:
            msg += f' Resolution Email sent to {user_email}.'
        if user_phone:
            msg += f' SMS alert dispatched to {user_phone}.'
        flash(msg, 'success')
    else:
        flash('You do not have permission to clear this issue.', 'danger')
    return redirect(url_for('main.admin_dashboard'))


@bp.route('/natural_disasters')
def natural_disasters():
    weather_summary = None
    try:
        from app.utils.weather_data import WeatherDataProcessor
        weather_summary = WeatherDataProcessor.get_weather_summary()
    except Exception as exc:
        print(f"Error fetching weather for natural disasters page: {exc}")
    return render_template('natural_disasters.html', weather=weather_summary)


@bp.route('/disasters/cyclone')
def disaster_cyclone():
    weather_summary = None
    try:
        from app.utils.weather_data import WeatherDataProcessor
        weather_summary = WeatherDataProcessor.get_weather_summary()
    except Exception:
        pass
    return render_template('disasters/cyclone.html', weather=weather_summary)


@bp.route('/disasters/tsunami')
def disaster_tsunami():
    return render_template('disasters/tsunami.html')


@bp.route('/disasters/floods')
def disaster_floods():
    weather_summary = None
    try:
        from app.utils.weather_data import WeatherDataProcessor
        weather_summary = WeatherDataProcessor.get_weather_summary()
    except Exception:
        pass
    return render_template('disasters/floods.html', weather=weather_summary)


@bp.route('/disasters/earthquakes')
def disaster_earthquakes():
    return render_template('disasters/earthquakes.html')


@bp.route('/disasters/winds')
def disaster_winds():
    weather_summary = None
    try:
        from app.utils.weather_data import WeatherDataProcessor
        weather_summary = WeatherDataProcessor.get_weather_summary()
    except Exception:
        pass
    return render_template('disasters/winds.html', weather=weather_summary)


@bp.route('/disasters/rainfall')
def disaster_rainfall():
    weather_summary = None
    try:
        from app.utils.weather_data import WeatherDataProcessor
        weather_summary = WeatherDataProcessor.get_weather_summary()
    except Exception:
        pass
    return render_template('disasters/rainfall.html', weather=weather_summary)


@bp.route('/disasters/landslides')
def disaster_landslides():
    weather_summary = None
    try:
        from app.utils.weather_data import WeatherDataProcessor
        weather_summary = WeatherDataProcessor.get_weather_summary()
    except Exception:
        pass
    return render_template('disasters/landslides.html', weather=weather_summary)


@bp.route('/issue_reporting')
def issue_reporting_page():
    return render_template('issue_reporting.html')


@bp.route('/learn')
def learn():
    """Citizen education hub: disaster awareness videos + quizzes."""
    return render_template('learn.html')


@bp.route('/report_issue', methods=['POST'])
@login_required
def report_issue():
    description = (request.form.get('issue') or '').strip()
    latitude = request.form.get('latitude')
    longitude = request.form.get('longitude')
    redirect_url = request.referrer or url_for('main.dashboard')
    if not (description and latitude and longitude):
        flash('Please provide all required information, including location.', 'danger')
        return redirect(redirect_url)
    try:
        lat = float(latitude)
        lng = float(longitude)
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            raise ValueError('Latitude or longitude is outside the valid range.')

        image_url = None
        # 1. Process uploaded photo file (gallery / file picker / mobile camera)
        photo_file = request.files.get('photo')
        if photo_file and photo_file.filename:
            filename = secure_filename(photo_file.filename)
            ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else 'jpg'
            if ext in {'png', 'jpg', 'jpeg', 'gif', 'webp', 'heic', 'heif'}:
                unique_filename = f"issue_{uuid.uuid4().hex[:12]}.{ext}"
                upload_folder = os.path.join(current_app.root_path, '..', 'static', 'uploads', 'issues')
                os.makedirs(upload_folder, exist_ok=True)
                file_path = os.path.join(upload_folder, unique_filename)
                photo_file.save(file_path)
                image_url = f"uploads/issues/{unique_filename}"

        # 2. Process base64 photo (from live WebRTC camera capture)
        photo_base64 = (request.form.get('photo_base64') or '').strip()
        if not image_url and photo_base64 and photo_base64.startswith('data:image'):
            try:
                header, encoded = photo_base64.split(',', 1)
                file_ext = 'jpg'
                if 'png' in header:
                    file_ext = 'png'
                elif 'webp' in header:
                    file_ext = 'webp'

                unique_filename = f"issue_cam_{uuid.uuid4().hex[:12]}.{file_ext}"
                upload_folder = os.path.join(current_app.root_path, '..', 'static', 'uploads', 'issues')
                os.makedirs(upload_folder, exist_ok=True)
                file_path = os.path.join(upload_folder, unique_filename)
                with open(file_path, 'wb') as f:
                    f.write(base64.b64decode(encoded))
                image_url = f"uploads/issues/{unique_filename}"
            except Exception as cam_err:
                print(f"Error saving base64 camera photo: {cam_err}")

        issue = Issue(
            description=description,
            latitude=lat,
            longitude=lng,
            user_id=current_user.id,
            image_url=image_url
        )
        db.session.add(issue) # type: ignore
        db.session.commit() # type: ignore
        flash('Your issue has been reported with photo evidence. Thank you!', 'success')
    except Exception as e:
        db.session.rollback() # type: ignore
        flash('Error reporting issue: ' + str(e), 'danger')
    return redirect(redirect_url)


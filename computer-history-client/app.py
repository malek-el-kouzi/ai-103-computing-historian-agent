"""
Flask Application for Computing History Agent Client.

This is the main Flask application that provides a web interface
for interacting with the Computing History agent.
"""

import base64
import binascii
from flask import Flask, render_template, request, jsonify
import markdown
import bleach
from agent_client import AgentClient

app = Flask(__name__)
MAX_IMAGE_SIZE = 5 * 1024 * 1024


def _validate_image_data_url(image_data):
    """Validate and return a supported PNG or JPEG data URL."""
    if not isinstance(image_data, str):
        return None, 'Image data is invalid'

    try:
        header, encoded_image = image_data.split(',', 1)
    except ValueError:
        return None, 'Image data is invalid'

    if header not in ('data:image/png;base64', 'data:image/jpeg;base64'):
        return None, 'Choose a PNG or JPEG image'
    if len(encoded_image) > ((MAX_IMAGE_SIZE + 2) // 3) * 4:
        return None, 'Image must be 5 MB or smaller'

    try:
        image_bytes = base64.b64decode(encoded_image, validate=True)
    except (binascii.Error, ValueError):
        return None, 'Image data is invalid'

    if len(image_bytes) > MAX_IMAGE_SIZE:
        return None, 'Image must be 5 MB or smaller'
    if header == 'data:image/png;base64' and not image_bytes.startswith(b'\x89PNG\r\n\x1a\n'):
        return None, 'Image data is not a valid PNG'
    if header == 'data:image/jpeg;base64' and not image_bytes.startswith(b'\xff\xd8\xff'):
        return None, 'Image data is not a valid JPEG'

    return image_data, None


def _set_external_link_attributes(attrs, new=False):
    """Force safe external link attributes for rendered markdown links."""
    href_key = (None, 'href')
    href_value = attrs.get(href_key, '')
    if isinstance(href_value, str) and href_value.startswith(('http://', 'https://')):
        attrs[(None, 'target')] = '_blank'
        attrs[(None, 'rel')] = 'noopener noreferrer nofollow'
    return attrs


def render_markdown_to_safe_html(text: str) -> str:
    """Convert markdown to safe HTML for display in chat bubbles."""
    raw_html = markdown.markdown(
        text,
        extensions=['extra', 'sane_lists', 'nl2br']
    )

    allowed_tags = [
        'p', 'br', 'hr', 'blockquote',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li',
        'strong', 'em', 'code', 'pre',
        'a',
        'table', 'thead', 'tbody', 'tr', 'th', 'td'
    ]
    allowed_attrs = {
        'a': ['href', 'title', 'target', 'rel'],
        'code': ['class']
    }

    safe_html = bleach.clean(
        raw_html,
        tags=allowed_tags,
        attributes=allowed_attrs,
        protocols=['http', 'https', 'mailto'],
        strip=True
    )

    # Linkify plain URLs while leaving code blocks untouched.
    safe_html = bleach.linkify(
        safe_html,
        skip_tags=['pre', 'code'],
        callbacks=[_set_external_link_attributes]
    )
    return safe_html

# Initialize the agent client
try:
    agent = AgentClient()
except Exception as e:
    print(f"Warning: Failed to initialize agent client: {e}")
    agent = None

@app.route('/')
def index():
    """Render the main chat interface."""
    return render_template('index.html')

@app.route('/chat', methods=['POST'])
def chat():
    """Handle chat messages from the user."""
    if not agent:
        return jsonify({
            'error': 'Agent client not initialized. Check your .env configuration.'
        }), 500
    
    data = request.get_json(silent=True) or {}
    user_message = data.get('message', '').strip()
    
    if not user_message:
        return jsonify({'error': 'Message is required'}), 400
    
    # Validate message length to prevent abuse
    if len(user_message) > 10000:
        return jsonify({'error': 'Message too long'}), 400

    image_data = data.get('image')
    if image_data is not None:
        image_data, image_error = _validate_image_data_url(image_data)
        if image_error:
            return jsonify({'error': image_error}), 400
    
    # Note: We do NOT escape HTML here because:
    # 1. The agent needs to receive the raw text to understand it properly
    # 2. HTML escaping is performed on the frontend when displaying messages
    # 3. This follows the principle: escape at the point of use (display), not at input
    try:
        response = agent.send_message(user_message, image_data)
    except Exception:
        app.logger.exception('Error communicating with agent')
        return jsonify({'error': 'Unable to get a response from the agent. Please try again.'}), 502

    response_html = render_markdown_to_safe_html(response)

    return jsonify({
        'response': response,
        'response_html': response_html
    })

@app.route('/reset', methods=['POST'])
def reset():
    """Reset the conversation history."""
    if agent:
        agent.reset_conversation()
    return jsonify({'status': 'success'})

if __name__ == '__main__':
    app.run(debug=False, port=5000)

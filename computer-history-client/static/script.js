// DOM elements
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const chatMessages = document.getElementById('chatMessages');
const resetBtn = document.getElementById('resetBtn');
const attachBtn = document.getElementById('attachBtn');
const imageInput = document.getElementById('imageInput');
const imagePreview = document.getElementById('imagePreview');
const imagePreviewImg = document.getElementById('imagePreviewImg');
const removeImageBtn = document.getElementById('removeImageBtn');
const imageError = document.getElementById('imageError');

const maxImageSize = 5 * 1024 * 1024;
let selectedImageDataUrl = null;
let imageReadPending = false;

// Event listeners
sendBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});
resetBtn.addEventListener('click', resetConversation);
attachBtn.addEventListener('click', () => imageInput.click());
imageInput.addEventListener('change', handleImageSelection);
removeImageBtn.addEventListener('click', () => {
    clearSelectedImage();
    attachBtn.focus();
});

// Keyboard accessibility: Allow Space key to activate buttons
sendBtn.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        sendMessage();
    }
});

resetBtn.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        resetConversation();
    }
});

// Functions
async function sendMessage() {
    const message = messageInput.value.trim();

    if (!message || imageReadPending) {
        return;
    }

    const submittedImage = selectedImageDataUrl;
    setInputDisabled(true);
    const typingIndicator = addTypingIndicator();

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message,
                image: submittedImage
            })
        });
        const data = await response.json();
        if (!response.ok || data.error) {
            throw new Error(data.error || 'Unable to send the message.');
        }

        typingIndicator.remove();
        const welcomeMessage = document.querySelector('.welcome-message');
        if (welcomeMessage) {
            welcomeMessage.remove();
        }
        addMessage(message, 'user', { image: submittedImage });
        if (data.response_html) {
            addMessage(data.response_html, 'agent', { isHtml: true });
        } else {
            addMessage(data.response, 'agent');
        }

        messageInput.value = '';
        clearSelectedImage();
    } catch (error) {
        typingIndicator.remove();
        addMessage(`Error: ${error.message}`, 'agent');
    } finally {
        setInputDisabled(false);
        messageInput.focus();
    }
}

function handleImageSelection() {
    const file = imageInput.files[0];
    imageInput.value = '';
    if (!file) {
        return;
    }

    if (!['image/png', 'image/jpeg'].includes(file.type)) {
        showImageError('Choose a PNG or JPEG image.');
        return;
    }
    if (file.size > maxImageSize) {
        showImageError('Image must be 5 MB or smaller.');
        return;
    }

    clearImageError();
    imageReadPending = true;
    setInputDisabled(false);
    const reader = new FileReader();
    reader.onload = () => {
        if (typeof reader.result !== 'string') {
            showImageError('Unable to read this image. Choose another file.');
        } else {
            selectedImageDataUrl = reader.result;
            imagePreviewImg.src = selectedImageDataUrl;
            imagePreview.hidden = false;
        }
        imageReadPending = false;
        setInputDisabled(false);
    };
    reader.onerror = () => {
        imageReadPending = false;
        showImageError('Unable to read this image. Choose another file.');
        setInputDisabled(false);
    };
    reader.readAsDataURL(file);
}

function clearSelectedImage() {
    selectedImageDataUrl = null;
    imagePreviewImg.removeAttribute('src');
    imagePreview.hidden = true;
    imageInput.value = '';
    clearImageError();
}

function showImageError(message) {
    imageError.textContent = message;
}

function clearImageError() {
    imageError.textContent = '';
}

function addMessage(text, sender, options = {}) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    messageDiv.setAttribute('role', 'article');
    messageDiv.setAttribute('aria-label', `${sender === 'user' ? 'User' : 'Agent'} message`);

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = sender === 'user' ? '👤' : '🤖';

    const content = document.createElement('div');
    content.className = 'message-content';

    if (options.isHtml === true) {
        content.innerHTML = text;
    } else {
        // Security: Escape HTML first, then safely render structured response content.
        const formattedText = renderMessageContent(text);
        content.innerHTML = formattedText;
    }

    if (options.image) {
        const image = document.createElement('img');
        image.className = 'message-image';
        image.src = options.image;
        image.alt = 'Image attached to the user message';
        content.appendChild(image);
    }

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);

    chatMessages.appendChild(messageDiv);
    scrollToBottom();

    // Scroll again after a short delay to ensure content is fully rendered
    setTimeout(scrollToBottom, 100);
    return messageDiv;
}

function renderMessageContent(text) {
    const normalizedText = String(text || '').replace(/\r\n/g, '\n');
    const markedLib = resolveMarkedLibrary();
    const purifyLib = resolvePurifyLibrary();

    // Fallback rendering if markdown libraries fail to load.
    if (!markedLib || !purifyLib) {
        return renderFallbackMarkdown(normalizedText);
    }

    const renderer = new markedLib.Renderer();
    renderer.link = (hrefOrToken, title, textValue) => {
        let href = hrefOrToken;
        let linkTitle = title;
        let textContent = textValue;

        // Marked v12+ uses an object argument; older versions pass (href, title, text).
        if (hrefOrToken && typeof hrefOrToken === 'object') {
            href = hrefOrToken.href;
            linkTitle = hrefOrToken.title;
            textContent = markedLib.Parser && hrefOrToken.tokens
                ? markedLib.Parser.parseInline(hrefOrToken.tokens)
                : hrefOrToken.text;
        }

        const safeHref = href || '#';
        const safeTitle = linkTitle ? ` title="${escapeHtml(linkTitle)}"` : '';
        return `<a href="${safeHref}"${safeTitle} target="_blank" rel="noopener noreferrer">${textContent}</a>`;
    };

    markedLib.setOptions({
        gfm: true,
        breaks: true,
        renderer
    });

    const rawHtml = markedLib.parse(normalizedText);
    return purifyLib.sanitize(rawHtml, {
        USE_PROFILES: { html: true },
        ALLOWED_ATTR: ['href', 'title', 'target', 'rel', 'class']
    });
}

function resolveMarkedLibrary() {
    if (typeof marked === 'undefined' && typeof window === 'undefined') {
        return null;
    }

    const candidate = typeof marked !== 'undefined' ? marked : window.marked;
    if (!candidate) {
        return null;
    }

    if (typeof candidate.parse === 'function') {
        return candidate;
    }

    if (typeof candidate.marked === 'function') {
        return {
            parse: candidate.marked,
            setOptions: candidate.setOptions ? candidate.setOptions.bind(candidate) : () => { },
            Renderer: candidate.Renderer,
            Parser: candidate.Parser
        };
    }

    if (typeof candidate === 'function') {
        return {
            parse: candidate,
            setOptions: candidate.setOptions ? candidate.setOptions.bind(candidate) : () => { },
            Renderer: candidate.Renderer,
            Parser: candidate.Parser
        };
    }

    return null;
}

function resolvePurifyLibrary() {
    if (typeof DOMPurify !== 'undefined') {
        return DOMPurify;
    }

    if (typeof window !== 'undefined') {
        if (window.DOMPurify) {
            return window.DOMPurify;
        }
        if (window.dompurify && typeof window.dompurify.sanitize === 'function') {
            return window.dompurify;
        }
    }

    return null;
}

function renderFallbackMarkdown(text) {
    let html = escapeHtml(text);

    // Fenced code blocks.
    html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, _language, code) => {
        return `<pre><code>${code.trimEnd()}</code></pre>`;
    });

    // Inline code, strong, emphasis.
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Links.
    html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');

    // Basic line breaks.
    return html.replace(/\n/g, '<br>');
}

function escapeHtml(text) {
    return text.replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function addTypingIndicator() {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message agent';
    messageDiv.id = 'typing-indicator';
    messageDiv.setAttribute('role', 'status');
    messageDiv.setAttribute('aria-label', 'Agent is typing');
    messageDiv.setAttribute('aria-live', 'polite');

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = '🤖';

    const content = document.createElement('div');
    content.className = 'message-content';

    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    indicator.setAttribute('aria-hidden', 'true');
    indicator.innerHTML = '<span></span><span></span><span></span>';

    content.appendChild(indicator);
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);

    chatMessages.appendChild(messageDiv);
    scrollToBottom();

    return messageDiv;
}

function setInputDisabled(disabled) {
    messageInput.disabled = disabled;
    sendBtn.disabled = disabled || imageReadPending;
    attachBtn.disabled = disabled || imageReadPending;
    imageInput.disabled = disabled || imageReadPending;
    removeImageBtn.disabled = disabled || imageReadPending;

    // Update ARIA attributes for better screen reader support
    if (disabled) {
        sendBtn.setAttribute('aria-busy', 'true');
        messageInput.setAttribute('aria-busy', 'true');
    } else {
        sendBtn.removeAttribute('aria-busy');
        messageInput.removeAttribute('aria-busy');
    }
}

function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function resetConversation() {
    // Announce to screen readers
    const announcement = document.createElement('div');
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.className = 'sr-only';
    announcement.textContent = 'Conversation reset';
    document.body.appendChild(announcement);

    // Call backend to reset conversation history
    fetch('/reset', {
        method: 'POST',
    })
        .then(response => response.json())
        .then(data => {
            // Clear chat messages
            chatMessages.innerHTML = '<div class="welcome-message" role="status">Let\'s chat about computing history...</div>';
            clearSelectedImage();
            messageInput.focus();

            // Remove announcement after a short delay
            setTimeout(() => announcement.remove(), 1000);
        })
        .catch(error => {
            console.error('Error resetting conversation:', error);
            announcement.textContent = 'Error resetting conversation';
            setTimeout(() => announcement.remove(), 1000);
        });
}

// Focus input on load
messageInput.focus();

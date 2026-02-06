# Web UI Component

Vanna includes a pre-built web component for chat interfaces.

## Basic Usage

```html
<!-- Include the component -->
<script src="https://img.vanna.ai/vanna-components.js"></script>

<!-- Use it -->
<vanna-chat
  sse-endpoint="https://your-api.com/api/vanna/v2/chat_sse"
  theme="light">
</vanna-chat>
```

## Configuration

### Endpoint

```html
<vanna-chat
  sse-endpoint="/api/vanna/v2/chat_sse">
</vanna-chat>
```

### Theme

```html
<!-- Light theme -->
<vanna-chat theme="light"></vanna-chat>

<!-- Dark theme -->
<vanna-chat theme="dark"></vanna-chat>

<!-- Auto (follows system) -->
<vanna-chat theme="auto"></vanna-chat>
```

### Custom Styling

```html
<vanna-chat
  style="--vanna-primary: #007bff; --vanna-bg: #f8f9fa;">
</vanna-chat>
```

### CSS Variables

```css
vanna-chat {
  --vanna-primary: #007bff;
  --vanna-primary-hover: #0056b3;
  --vanna-bg: #ffffff;
  --vanna-text: #333333;
  --vanna-border: #dee2e6;
  --vanna-code-bg: #f4f4f4;
  --vanna-font-family: system-ui, sans-serif;
  --vanna-border-radius: 8px;
}
```

## Authentication

The component uses your existing cookies/JWTs:

```html
<!-- Cookies are sent automatically -->
<vanna-chat
  sse-endpoint="/api/vanna/v2/chat_sse">
</vanna-chat>
```

### With Custom Headers

```html
<vanna-chat
  sse-endpoint="/api/vanna/v2/chat_sse"
  auth-header="Bearer your-token-here">
</vanna-chat>
```

### Dynamic Token

```javascript
const chat = document.querySelector('vanna-chat');
chat.setAuthHeader(`Bearer ${getToken()}`);
```

## Framework Integration

### React

```jsx
import { useEffect, useRef } from 'react';

function VannaChat() {
  const chatRef = useRef(null);
  
  useEffect(() => {
    // Import component
    import('https://img.vanna.ai/vanna-components.js');
  }, []);
  
  return (
    <vanna-chat
      ref={chatRef}
      sse-endpoint="/api/vanna/v2/chat_sse"
      theme="light"
    />
  );
}
```

### Vue

```vue
<template>
  <vanna-chat
    :sse-endpoint="endpoint"
    theme="dark"
  />
</template>

<script setup>
import { onMounted } from 'vue';

const endpoint = '/api/vanna/v2/chat_sse';

onMounted(() => {
  import('https://img.vanna.ai/vanna-components.js');
});
</script>
```

### Angular

```typescript
// component.ts
import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-chat',
  template: `
    <vanna-chat
      sse-endpoint="/api/vanna/v2/chat_sse"
      theme="light">
    </vanna-chat>
  `
})
export class ChatComponent implements OnInit {
  ngOnInit() {
    import('https://img.vanna.ai/vanna-components.js');
  }
}
```

## Events

### Listen for Events

```javascript
const chat = document.querySelector('vanna-chat');

chat.addEventListener('vanna-message-sent', (e) => {
  console.log('User sent:', e.detail.message);
});

chat.addEventListener('vanna-response-complete', (e) => {
  console.log('Response:', e.detail);
});

chat.addEventListener('vanna-error', (e) => {
  console.error('Error:', e.detail.error);
});
```

### Available Events

- `vanna-message-sent` - User sent a message
- `vanna-response-started` - Response streaming started
- `vanna-response-complete` - Response finished
- `vanna-error` - Error occurred
- `vanna-table-rendered` - Table component rendered
- `vanna-chart-rendered` - Chart component rendered

## Methods

```javascript
const chat = document.querySelector('vanna-chat');

// Send a message programmatically
chat.sendMessage('Show me the top customers');

// Clear conversation
chat.clearConversation();

// Set auth header
chat.setAuthHeader('Bearer token');

// Get conversation history
const history = chat.getHistory();
```

## Streaming Components

The component renders these streamed components:

1. **Progress** - Status updates
2. **Code** - SQL with syntax highlighting
3. **Table** - Interactive data tables
4. **Chart** - Plotly visualizations
5. **Text** - Markdown-formatted text

## Responsive Design

The component is fully responsive:

- Desktop: Full layout with sidebar
- Tablet: Collapsed sidebar
- Mobile: Stacked layout

```css
/* Override breakpoints */
vanna-chat {
  --vanna-mobile-breakpoint: 480px;
  --vanna-tablet-breakpoint: 768px;
}
```

## Accessibility

The component follows WCAG 2.1 guidelines:

- Keyboard navigation
- Screen reader support
- Focus management
- High contrast mode
- Reduced motion support

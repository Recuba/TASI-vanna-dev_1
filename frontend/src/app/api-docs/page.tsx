'use client';

import dynamic from 'next/dynamic';

const SwaggerUI = dynamic(() => import('swagger-ui-react'), { ssr: false });

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-dark-bg">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gold mb-6">
          Ra&apos;d AI API Documentation
        </h1>
        <div className="swagger-dark">
          <SwaggerUI url="/api-docs/openapi.yaml" />
        </div>
      </div>

      {/* Dark theme overrides for Swagger UI */}
      <style jsx global>{`
        .swagger-dark .swagger-ui {
          color: #b0b0b0;
        }
        .swagger-dark .swagger-ui .topbar {
          display: none;
        }
        .swagger-dark .swagger-ui .info .title {
          color: #d4a84b;
        }
        .swagger-dark .swagger-ui .info p,
        .swagger-dark .swagger-ui .info li {
          color: #b0b0b0;
        }
        .swagger-dark .swagger-ui .info a {
          color: #d4a84b;
        }
        .swagger-dark .swagger-ui .scheme-container {
          background: #1a1a1a;
          box-shadow: none;
        }
        .swagger-dark .swagger-ui .opblock-tag {
          color: #ffffff;
          border-bottom-color: #333;
        }
        .swagger-dark .swagger-ui .opblock-tag:hover {
          background: #1a1a1a;
        }
        .swagger-dark .swagger-ui .opblock {
          border-color: #333;
          background: #1a1a1a;
        }
        .swagger-dark .swagger-ui .opblock .opblock-summary {
          border-color: #333;
        }
        .swagger-dark .swagger-ui .opblock .opblock-summary-method {
          font-weight: 700;
        }
        .swagger-dark .swagger-ui .opblock .opblock-summary-path,
        .swagger-dark .swagger-ui .opblock .opblock-summary-description {
          color: #b0b0b0;
        }
        .swagger-dark .swagger-ui .opblock .opblock-section-header {
          background: #252525;
          border-color: #333;
        }
        .swagger-dark .swagger-ui .opblock .opblock-section-header h4 {
          color: #ffffff;
        }
        .swagger-dark .swagger-ui .opblock-body pre {
          background: #0e0e0e;
          color: #b0b0b0;
        }
        .swagger-dark .swagger-ui .opblock.opblock-get {
          background: rgba(74, 159, 255, 0.05);
          border-color: rgba(74, 159, 255, 0.3);
        }
        .swagger-dark .swagger-ui .opblock.opblock-post {
          background: rgba(76, 175, 80, 0.05);
          border-color: rgba(76, 175, 80, 0.3);
        }
        .swagger-dark .swagger-ui .opblock.opblock-delete {
          background: rgba(255, 107, 107, 0.05);
          border-color: rgba(255, 107, 107, 0.3);
        }
        .swagger-dark .swagger-ui .opblock.opblock-patch {
          background: rgba(212, 168, 75, 0.05);
          border-color: rgba(212, 168, 75, 0.3);
        }
        .swagger-dark .swagger-ui table thead tr th,
        .swagger-dark .swagger-ui table thead tr td {
          color: #b0b0b0;
          border-color: #333;
        }
        .swagger-dark .swagger-ui table tbody tr td {
          color: #b0b0b0;
          border-color: #333;
        }
        .swagger-dark .swagger-ui .model-box,
        .swagger-dark .swagger-ui section.models {
          background: #1a1a1a;
          border-color: #333;
        }
        .swagger-dark .swagger-ui section.models h4 {
          color: #ffffff;
        }
        .swagger-dark .swagger-ui .model {
          color: #b0b0b0;
        }
        .swagger-dark .swagger-ui .model-title {
          color: #d4a84b;
        }
        .swagger-dark .swagger-ui .prop-type {
          color: #4a9fff;
        }
        .swagger-dark .swagger-ui .parameter__name {
          color: #ffffff;
        }
        .swagger-dark .swagger-ui .parameter__type {
          color: #4a9fff;
        }
        .swagger-dark .swagger-ui input[type="text"],
        .swagger-dark .swagger-ui textarea,
        .swagger-dark .swagger-ui select {
          background: #2a2a2a;
          color: #ffffff;
          border-color: #333;
        }
        .swagger-dark .swagger-ui .btn {
          color: #ffffff;
          border-color: #d4a84b;
        }
        .swagger-dark .swagger-ui .btn:hover {
          background: rgba(212, 168, 75, 0.1);
        }
        .swagger-dark .swagger-ui .btn.execute {
          background: #d4a84b;
          color: #0e0e0e;
          border-color: #d4a84b;
        }
        .swagger-dark .swagger-ui .btn.execute:hover {
          background: #e8c872;
        }
        .swagger-dark .swagger-ui .response-col_status {
          color: #ffffff;
        }
        .swagger-dark .swagger-ui .response-col_description {
          color: #b0b0b0;
        }
        .swagger-dark .swagger-ui .responses-inner {
          background: transparent;
        }
        .swagger-dark .swagger-ui .highlight-code {
          background: #0e0e0e;
        }
        .swagger-dark .swagger-ui .markdown p,
        .swagger-dark .swagger-ui .markdown li {
          color: #b0b0b0;
        }
        .swagger-dark .swagger-ui .markdown code {
          background: #2a2a2a;
          color: #d4a84b;
        }
        .swagger-dark .swagger-ui .renderedMarkdown p {
          color: #b0b0b0;
        }
        .swagger-dark .swagger-ui .auth-wrapper .authorize {
          border-color: #d4a84b;
          color: #d4a84b;
        }
        .swagger-dark .swagger-ui .auth-wrapper .authorize svg {
          fill: #d4a84b;
        }
        .swagger-dark .swagger-ui .dialog-ux .modal-ux {
          background: #1a1a1a;
          border-color: #333;
        }
        .swagger-dark .swagger-ui .dialog-ux .modal-ux-header h3 {
          color: #ffffff;
        }
        .swagger-dark .swagger-ui .dialog-ux .modal-ux-content p {
          color: #b0b0b0;
        }
        .swagger-dark .swagger-ui .loading-container .loading::after {
          color: #d4a84b;
        }
      `}</style>
    </div>
  );
}

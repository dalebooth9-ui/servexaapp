import * as React from 'https://esm.sh/react@18.3.1';
import { Html, Head, Preview, Body, Container, Heading, Text, Img } from 'https://esm.sh/@react-email/components@0.0.22?deps=react@18.3.1&target=deno';
import type { TemplateEntry } from './registry.ts';

function RenewalEmail({ subject, body, company_name, logo_url, brand_color }: Record<string, string>) {
  return <Html lang="en"><Head /><Preview>{subject}</Preview><Body style={{ backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }}><Container style={{ padding: '24px', borderTop: `4px solid ${brand_color || '#333333'}` }}>
    {logo_url ? <Img src={logo_url} alt={company_name} width="180" /> : <Heading>{company_name}</Heading>}
    <Heading>{subject}</Heading>
    {String(body || '').split('\n').map((line, i) => <Text key={i}>{line || ' '}</Text>)}
  </Container></Body></Html>;
}

export const template = { component: RenewalEmail, subject: (data: Record<string, any>) => data.subject || 'Service renewal reminder', displayName: 'Service renewal reminder' } satisfies TemplateEntry;
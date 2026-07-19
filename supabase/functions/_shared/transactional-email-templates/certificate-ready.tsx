import * as React from 'https://esm.sh/react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Section, Hr,
} from 'https://esm.sh/@react-email/components@0.0.22?deps=react@18.3.1&target=deno'
import type { TemplateEntry } from './registry.ts'

interface CertificateReadyProps {
  customer_first_name?: string
  job_reference?: string
  job_category?: string
  site_address?: string
  company_name?: string
  company_footer?: string
}

const CertificateReadyEmail = ({
  customer_first_name = 'there',
  job_reference = '',
  job_category = 'fire protection works',
  site_address = 'your site',
  company_name = 'Your fire protection provider',
  company_footer,
}: CertificateReadyProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`Your fire protection certificate is ready${job_reference ? ` — ${job_reference}` : ''}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Hi {customer_first_name},</Heading>
        <Text style={text}>
          We've completed the {job_category} at {site_address}. The signed certificate
          is attached and a copy is on file in your customer portal.
        </Text>
        <Text style={text}>
          If you have any questions please reply to this email.
        </Text>
        <Section style={signoff}>
          <Text style={text}>Best regards,</Text>
          <Text style={textBold}>{company_name}</Text>
        </Section>
        <Hr style={hr} />
        <Text style={footer}>
          {company_footer ??
            `${company_name} — works carried out in accordance with applicable British Standards. This email and any attachments are confidential and intended solely for the addressee.`}
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: CertificateReadyEmail,
  subject: (data: Record<string, any>) =>
    `Your fire protection certificate is ready${data?.job_reference ? ` — ${data.job_reference}` : ''}`,
  displayName: 'Certificate ready',
  previewData: {
    customer_first_name: 'Sarah',
    job_reference: 'VFP-001234',
    job_category: '6-monthly sprinkler service',
    site_address: 'Acme Warehouse, Unit 4, Manchester M1 2AB',
    company_name: 'Your fire protection provider',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '20px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#0f172a', lineHeight: '1.6', margin: '0 0 14px' }
const textBold = { fontSize: '14px', color: '#0f172a', fontWeight: 'bold', margin: '0' }
const signoff = { margin: '20px 0 0' }
const hr = { borderColor: '#e2e8f0', margin: '24px 0 16px' }
const footer = { fontSize: '12px', color: '#64748b', lineHeight: '1.5', margin: '0' }

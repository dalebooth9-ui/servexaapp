// @deno-types="npm:@types/react@18.3.1"
import * as React from 'https://esm.sh/react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Section,
} from 'https://esm.sh/@react-email/components@0.0.22?deps=react@18.3.1&target=deno'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Servexa'

interface NewJobFromApiProps {
  jobName?: string
  customer?: string
  priority?: string
  source?: string
}

const NewJobFromApiEmail = ({
  jobName = 'Untitled job',
  customer = 'Unknown customer',
  priority = 'medium',
  source = 'Email Triage',
}: NewJobFromApiProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`New job created via ${source}: ${jobName}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>New job created via {source}</Heading>
        <Section style={card}>
          <Text style={line}><strong>Job:</strong> {jobName}</Text>
          <Text style={line}><strong>Customer:</strong> {customer}</Text>
          <Text style={line}><strong>Priority:</strong> {priority}</Text>
        </Section>
        <Text style={text}>Log in to {SITE_NAME} to review.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: NewJobFromApiEmail,
  subject: (data: Record<string, any>) =>
    `New job from ${data?.source || 'API'}: ${data?.jobName || 'Untitled'}`,
  displayName: 'New job from API',
  previewData: {
    jobName: 'Fire alarm fault — Building B',
    customer: 'Acme Properties Ltd',
    priority: 'high',
    source: 'Email Triage',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '20px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 16px' }
const card = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '16px 18px', margin: '0 0 20px' }
const line = { fontSize: '14px', color: '#0f172a', margin: '4px 0' }
const text = { fontSize: '14px', color: '#475569', lineHeight: '1.5', margin: '0' }

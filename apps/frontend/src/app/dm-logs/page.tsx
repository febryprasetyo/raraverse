import { redirect } from 'next/navigation';

export default function DmLogsRedirectPage() {
  redirect('/scheduler?tab=dm');
}

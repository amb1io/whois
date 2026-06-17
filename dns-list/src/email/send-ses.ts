import { AwsClient } from "aws4fetch";

export interface SendNotifyEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

function sesEndpoint(region: string): string {
  return `https://email.${region}.amazonaws.com/v2/email/outbound-emails`;
}

function formatFromAddress(name: string, email: string): string {
  const safeName = name.replace(/"/g, '\\"');
  return `"${safeName}" <${email}>`;
}

export async function sendNotifyEmail(
  env: Env,
  input: SendNotifyEmailInput
): Promise<void> {
  const accessKeyId = env.AWS_SES_ACCESS_KEY_ID;
  const secretAccessKey = env.AWS_SES_SECRET_ACCESS_KEY;
  const region = env.AWS_SES_REGION;

  if (!accessKeyId || !secretAccessKey) {
    throw new Error("SES credentials are not configured");
  }

  const aws = new AwsClient({
    accessKeyId,
    secretAccessKey,
    region,
  });

  const response = await aws.fetch(sesEndpoint(region), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      FromEmailAddress: formatFromAddress(env.SES_FROM_NAME, env.SES_FROM_EMAIL),
      Destination: {
        ToAddresses: [input.to],
      },
      Content: {
        Simple: {
          Subject: {
            Data: input.subject,
            Charset: "UTF-8",
          },
          Body: {
            Html: {
              Data: input.html,
              Charset: "UTF-8",
            },
            Text: {
              Data: input.text,
              Charset: "UTF-8",
            },
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`SES ${response.status}: ${body}`);
  }
}

export interface ReplyCommentInput {
  commentId: string;
  message: string;
}

export interface SendPrivateReplyDmInput {
  igUserId: string;
  commentId: string;
  message: string;
}

export interface IMetaGraphClient {
  replyToComment(input: ReplyCommentInput): Promise<void>;
  sendPrivateReplyDm(input: SendPrivateReplyDmInput): Promise<void>;
}

export class MockMetaGraphClient implements IMetaGraphClient {
  async replyToComment(): Promise<void> {
    // No-op in mock mode
  }

  async sendPrivateReplyDm(): Promise<void> {
    // No-op in mock mode
  }
}

export class MetaGraphHttpClient implements IMetaGraphClient {
  private readonly accessToken: string;
  private readonly graphBaseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: {
    accessToken: string;
    graphBaseUrl?: string;
    fetchFn?: typeof fetch;
  }) {
    if (!options.accessToken) {
      throw new Error('Meta access token is required for MetaGraphHttpClient');
    }
    this.accessToken = options.accessToken;
    this.graphBaseUrl = (
      options.graphBaseUrl ?? 'https://graph.facebook.com/v21.0'
    ).replace(/\/$/, '');
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async replyToComment(input: ReplyCommentInput): Promise<void> {
    const res = await this.fetchFn(
      `${this.graphBaseUrl}/${encodeURIComponent(input.commentId)}/replies`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify({ message: input.message }),
      }
    );

    if (!res.ok) {
      throw new Error(`Meta replyToComment error (${res.status})`);
    }
  }

  async sendPrivateReplyDm(input: SendPrivateReplyDmInput): Promise<void> {
    const res = await this.fetchFn(
      `${this.graphBaseUrl}/${encodeURIComponent(input.igUserId)}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.accessToken}`,
        },
        body: JSON.stringify({
          recipient: { comment_id: input.commentId },
          message: { text: input.message },
        }),
      }
    );

    if (!res.ok) {
      throw new Error(`Meta sendPrivateReplyDm error (${res.status})`);
    }
  }
}

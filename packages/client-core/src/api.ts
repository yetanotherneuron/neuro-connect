import type {
  AuthResponse,
  AdminUserInfo,
  ChannelInfo,
  DmThread,
  FriendEntry,
  FriendRequestInfo,
  FriendsSnapshot,
  GameHostInfo,
  MediaRelayInfo,
  MemberInfo,
  MessageInfo,
  Rank,
  ServerInfo,
  ServerMeta,
  UpdateManifest,
  UserPublic,
} from "./types";

let baseUrl = "http://127.0.0.1:7420";
let authToken: string | null = null;

export function setBaseUrl(url: string) {
  baseUrl = url.replace(/\/$/, "");
}

export function getBaseUrl() {
  return baseUrl;
}

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function getAuthToken() {
  return authToken;
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }
  const res = await fetch(`${baseUrl}${path}`, { ...init, headers });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = await res.json();
      msg = data.error || msg;
    } catch {
      /* ignore */
    }
    if (res.status === 401 && authToken) {
      window.dispatchEvent(new CustomEvent("nc-auth-expired", { detail: { message: msg } }));
    }
    throw new Error(msg);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return res.json();
}

export function registerUser(username: string, password: string, displayName: string) {
  return apiRequest<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({
      username,
      password,
      display_name: displayName,
    }),
  });
}

export function loginUser(username: string, password: string) {
  return apiRequest<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export function logoutUser() {
  return apiRequest<void>("/api/auth/logout", { method: "POST" });
}

export function fetchMe() {
  return apiRequest<UserPublic>("/api/me");
}

export function updateProfile(body: {
  display_name?: string;
  avatar_url?: string;
  banner_url?: string;
}) {
  return apiRequest<UserPublic>("/api/me", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export function listServers() {
  return apiRequest<ServerInfo[]>("/api/servers");
}

export function createServer(name: string, description?: string) {
  return apiRequest<ServerInfo>("/api/servers", {
    method: "POST",
    body: JSON.stringify({ name, description }),
  });
}

export function joinServer(inviteCode: string) {
  return apiRequest<ServerInfo>("/api/servers/join", {
    method: "POST",
    body: JSON.stringify({ invite_code: inviteCode }),
  });
}

export function listChannels(serverId: string) {
  return apiRequest<ChannelInfo[]>(`/api/servers/${serverId}/channels`);
}

export function createChannel(serverId: string, name: string, kind: "text" | "voice") {
  return apiRequest<ChannelInfo>(`/api/servers/${serverId}/channels`, {
    method: "POST",
    body: JSON.stringify({ name, kind }),
  });
}

export function renameChannel(channelId: string, name: string) {
  return apiRequest<ChannelInfo>(`/api/channels/${channelId}`, {
    method: "PUT",
    body: JSON.stringify({ name }),
  });
}

export function deleteChannel(channelId: string) {
  return apiRequest<void>(`/api/channels/${channelId}`, { method: "DELETE" });
}

export function listMembers(serverId: string) {
  return apiRequest<MemberInfo[]>(`/api/servers/${serverId}/members`);
}

export function setMemberRank(serverId: string, userId: string, rank: Rank) {
  return apiRequest<MemberInfo>(`/api/servers/${serverId}/members/rank`, {
    method: "POST",
    body: JSON.stringify({ user_id: userId, rank }),
  });
}

export function listMessages(channelId: string) {
  return apiRequest<MessageInfo[]>(`/api/channels/${channelId}/messages?limit=100`);
}

export function sendMessage(
  channelId: string,
  content: string,
  attachment?: { url: string; name: string },
  replyToId?: string,
) {
  return apiRequest<MessageInfo>(`/api/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content,
      attachment_url: attachment?.url,
      attachment_name: attachment?.name,
      reply_to_id: replyToId ?? null,
    }),
  });
}

export function deleteMessage(messageId: string) {
  return apiRequest<void>(`/api/messages/${messageId}`, { method: "DELETE" });
}

export function listDms() {
  return apiRequest<DmThread[]>("/api/dms");
}

export function openDm(userId: string) {
  return apiRequest<DmThread>(`/api/dms/${userId}`, { method: "POST" });
}

export function createGroupDm(name: string, memberIds: string[]) {
  return apiRequest<DmThread>("/api/dms/group", {
    method: "POST",
    body: JSON.stringify({ name, member_ids: memberIds }),
  });
}

export function editMessage(id: string, content: string) {
  return apiRequest<MessageInfo>(`/api/messages/${id}`, {
    method: "PUT",
    body: JSON.stringify({ content }),
  });
}

export function reactMessage(id: string, emoji: string) {
  return apiRequest<MessageInfo>(`/api/messages/${id}/reactions`, {
    method: "POST",
    body: JSON.stringify({ emoji }),
  });
}

export function listDmMessages(dmId: string) {
  return apiRequest<MessageInfo[]>(`/api/dms/${dmId}/messages?limit=100`);
}

export function markChannelRead(channelId: string, messageId?: string) {
  return apiRequest<void>(`/api/channels/${channelId}/read`, {
    method: "POST",
    body: JSON.stringify({ message_id: messageId || null }),
  });
}

export function markDmRead(dmId: string, messageId?: string) {
  return apiRequest<void>(`/api/dms/${dmId}/read`, {
    method: "POST",
    body: JSON.stringify({ message_id: messageId || null }),
  });
}

export function searchChannelMessages(channelId: string, q: string, limit = 25) {
  return apiRequest<MessageInfo[]>(
    `/api/channels/${channelId}/messages/search?q=${encodeURIComponent(q)}&limit=${limit}`,
  );
}

export function searchDmMessages(dmId: string, q: string, limit = 25) {
  return apiRequest<MessageInfo[]>(
    `/api/dms/${dmId}/messages/search?q=${encodeURIComponent(q)}&limit=${limit}`,
  );
}

export function sendDmMessage(
  dmId: string,
  content: string,
  attachment?: { url: string; name: string },
  replyToId?: string,
) {
  return apiRequest<MessageInfo>(`/api/dms/${dmId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      content,
      attachment_url: attachment?.url,
      attachment_name: attachment?.name,
      reply_to_id: replyToId ?? null,
    }),
  });
}

export async function uploadFile(file: File) {
  const form = new FormData();
  form.append("file", file);
  return apiRequest<{ url: string; name: string; size: number }>("/api/upload", {
    method: "POST",
    body: form,
  });
}

export function ResolveAssetUrl(path: string) {
  if (!path) return path;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${baseUrl}${path}`;
}

export type RealtimeClient = {
  ws: WebSocket;
  send: (msg: unknown) => void;
  close: () => void;
};

export function connectRealtime(onEvent: (data: unknown) => void): RealtimeClient | null {
  if (!authToken) return null;
  const wsBase = baseUrl.replace(/^http/, "ws");
  const ws = new WebSocket(`${wsBase}/api/ws?token=${encodeURIComponent(authToken)}`);
  ws.onmessage = (ev) => {
    try {
      onEvent(JSON.parse(ev.data));
    } catch {
      /* ignore */
    }
  };
  return {
    ws,
    send(msg: unknown) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    },
    close() {
      ws.close();
    },
  };
}

export async function fetchLatestUpdate(channel: string, platform: string) {
  const headers = new Headers();
  if (authToken) headers.set("Authorization", `Bearer ${authToken}`);
  const res = await fetch(
    `${baseUrl}/api/updates/latest?channel=${encodeURIComponent(channel)}&platform=${encodeURIComponent(platform)}`,
    { headers },
  );
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return (await res.json()) as UpdateManifest;
}

export function updateDownloadUrl(channel: string, platform: string, filename: string) {
  return `${baseUrl}/api/updates/download/${encodeURIComponent(channel)}/${encodeURIComponent(platform)}/${encodeURIComponent(filename)}`;
}

export function fetchMeta() {
  return apiRequest<ServerMeta>("/api/meta");
}

export function claimGlobalAdmin(bootstrapSecret: string) {
  return apiRequest<UserPublic>("/api/admin/claim", {
    method: "POST",
    body: JSON.stringify({ bootstrap_secret: bootstrapSecret }),
  });
}

export function listAdminUsers() {
  return apiRequest<AdminUserInfo[]>("/api/admin/users");
}

export function banUser(userId: string, reason: string) {
  return apiRequest<void>(`/api/admin/users/${userId}/ban`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function unbanUser(userId: string) {
  return apiRequest<void>(`/api/admin/users/${userId}/unban`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function deleteAdminServer(serverId: string) {
  return apiRequest<void>(`/api/admin/servers/${serverId}`, { method: "DELETE" });
}

export function fetchVoiceStatus() {
  return apiRequest<Record<string, unknown>>("/api/voice/status");
}

export function fetchMediaStatus() {
  return apiRequest<{
    status: string;
    ready: boolean;
    active: boolean;
    relay: MediaRelayInfo | null;
    message?: string;
  }>("/api/media/status");
}

export function startMediaRelay(body: {
  url: string;
  title?: string;
  channel_id?: string | null;
  server_id?: string | null;
}) {
  return apiRequest<MediaRelayInfo>("/api/media/start", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function stopMediaRelay() {
  return apiRequest<{ ok: boolean; relay_id: string }>("/api/media/stop", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/** Build authenticated stream URL for &lt;audio&gt;/&lt;video&gt; elements. */
export function mediaStreamUrl(streamPath: string) {
  const token = authToken || "";
  const sep = streamPath.includes("?") ? "&" : "?";
  return `${baseUrl}${streamPath}${sep}token=${encodeURIComponent(token)}`;
}

export function fetchLanStatus() {
  return apiRequest<Record<string, unknown>>("/api/lan/status");
}

export function listGameHosts(serverId?: string) {
  const q = serverId ? `?server_id=${encodeURIComponent(serverId)}` : "";
  return apiRequest<GameHostInfo[]>(`/api/game-hosts${q}`);
}

export function lookupGameHostCode(code: string) {
  return apiRequest<GameHostInfo>(
    `/api/game-hosts/code/${encodeURIComponent(code.trim())}`,
  );
}

export function createGameHost(body: {
  game_name: string;
  address: string;
  note?: string;
  kind?: "direct" | "goldberg";
  app_id?: string;
  connect_command?: string;
  server_id?: string | null;
  ttl_minutes?: number;
}) {
  return apiRequest<GameHostInfo>("/api/game-hosts", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function deleteGameHost(id: string) {
  return apiRequest<void>(`/api/game-hosts/${id}`, { method: "DELETE" });
}

export function fetchFriends() {
  return apiRequest<FriendsSnapshot>("/api/friends");
}

export function sendFriendRequest(username: string) {
  return apiRequest<FriendRequestInfo>("/api/friends/request", {
    method: "POST",
    body: JSON.stringify({ username }),
  });
}

export function acceptFriendRequest(id: string) {
  return apiRequest<FriendEntry>(`/api/friends/requests/${id}/accept`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function declineFriendRequest(id: string) {
  return apiRequest<{ ok: boolean }>(`/api/friends/requests/${id}/decline`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function removeFriend(userId: string) {
  return apiRequest<{ ok: boolean }>(`/api/friends/${userId}`, { method: "DELETE" });
}

export function blockUser(userId: string) {
  return apiRequest<{ ok: boolean }>(`/api/users/${userId}/block`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function unblockUser(userId: string) {
  return apiRequest<{ ok: boolean }>(`/api/users/${userId}/block`, { method: "DELETE" });
}

export function ignoreUser(userId: string) {
  return apiRequest<{ ok: boolean }>(`/api/users/${userId}/ignore`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function unignoreUser(userId: string) {
  return apiRequest<{ ok: boolean }>(`/api/users/${userId}/ignore`, { method: "DELETE" });
}

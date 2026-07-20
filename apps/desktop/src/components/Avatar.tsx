import { ResolveAssetUrl } from "../lib/api";
import type { UserPublic } from "../lib/types";
import "./Avatar.css";

const DEFAULT_AVATAR =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
      <rect width="128" height="128" fill="#1a1a26"/>
      <circle cx="64" cy="48" r="22" fill="#7c3aed"/>
      <ellipse cx="64" cy="104" rx="36" ry="28" fill="#7c3aed"/>
      <circle cx="64" cy="48" r="14" fill="#0e0e14"/>
    </svg>`,
  );

const DEFAULT_BANNER =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="120" viewBox="0 0 480 120">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#1a1030"/><stop offset="100%" stop-color="#3b1d6e"/>
      </linearGradient></defs>
      <rect width="480" height="120" fill="url(#g)"/>
    </svg>`,
  );

export function DefaultAvatarUrl() {
  return DEFAULT_AVATAR;
}

export function DefaultBannerUrl() {
  return DEFAULT_BANNER;
}

export function AvatarImage({
  user,
  size = 36,
  className = "",
}: {
  user: Pick<UserPublic, "display_name" | "avatar_url">;
  size?: number;
  className?: string;
}) {
  const src = user.avatar_url ? ResolveAssetUrl(user.avatar_url) : DEFAULT_AVATAR;
  return (
    <img
      className={`avatar ${className}`}
      src={src}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).src = DEFAULT_AVATAR;
      }}
    />
  );
}

export function ProfileCard({ user }: { user: UserPublic }) {
  const banner = user.banner_url ? ResolveAssetUrl(user.banner_url) : DEFAULT_BANNER;
  return (
    <div className="profile-card">
      <div className="profile-banner" style={{ backgroundImage: `url(${banner})` }} />
      <div className="profile-body">
        <AvatarImage user={user} size={64} className="profile-avatar" />
        <div>
          <strong>{user.display_name}</strong>
          <div className="muted">@{user.username}</div>
          {user.is_global_admin && <div className="admin-badge">Global Admin</div>}
        </div>
      </div>
    </div>
  );
}

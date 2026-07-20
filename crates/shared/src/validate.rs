use regex::Regex;
use std::sync::OnceLock;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ValidateError {
    #[error("username must be 3-32 English letters, numbers, or underscores")]
    Username,
    #[error("password must be at least 8 characters")]
    Password,
    #[error("display name must be 1-64 characters")]
    DisplayName,
    #[error("server name must be 1-64 characters")]
    ServerName,
    #[error("channel name must be 1-32 characters")]
    ChannelName,
    #[error("invalid image url")]
    ImageUrl,
}

fn username_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^[a-zA-Z][a-zA-Z0-9_]{2,31}$").expect("username regex"))
}

pub fn validate_username(username: &str) -> Result<(), ValidateError> {
    if username_regex().is_match(username) {
        Ok(())
    } else {
        Err(ValidateError::Username)
    }
}

pub fn validate_password(password: &str) -> Result<(), ValidateError> {
    if password.chars().count() >= 8 {
        Ok(())
    } else {
        Err(ValidateError::Password)
    }
}

pub fn validate_display_name(name: &str) -> Result<(), ValidateError> {
    let len = name.chars().count();
    if (1..=64).contains(&len) {
        Ok(())
    } else {
        Err(ValidateError::DisplayName)
    }
}

pub fn validate_server_name(name: &str) -> Result<(), ValidateError> {
    let len = name.chars().count();
    if (1..=64).contains(&len) {
        Ok(())
    } else {
        Err(ValidateError::ServerName)
    }
}

pub fn validate_channel_name(name: &str) -> Result<(), ValidateError> {
    let len = name.chars().count();
    if (1..=32).contains(&len) {
        Ok(())
    } else {
        Err(ValidateError::ChannelName)
    }
}

pub fn validate_image_url(url: &str) -> Result<(), ValidateError> {
    if url.is_empty() {
        return Ok(());
    }
    if url.starts_with("http://") || url.starts_with("https://") {
        Ok(())
    } else {
        Err(ValidateError::ImageUrl)
    }
}

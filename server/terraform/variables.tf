variable "region" {
  description = "AWS region. us-east-1 is fine: the model call dominates strip-reading time, and India's DPDP Act allows transfers to the US."
  type        = string
  default     = "us-east-1"
}

variable "name" {
  description = "Prefix for every resource and SSM parameter (/<name>/install-secret, /<name>/model-key)."
  type        = string
  default     = "takesure"
}

variable "model" {
  description = "Model used to read strips (server-side only; the app never sees it)."
  type        = string
  default     = "claude-sonnet-5-5"
}

variable "model_calls_per_day" {
  description = "Global daily cap on model calls (cost cap). 0 = strip reading off: training photos only. Above the cap the app reads strips on the phone."
  type        = number
  default     = 0
}

{{- define "starwave.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "starwave.fullname" -}}
{{- $name := include "starwave.name" . -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "starwave.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "starwave.labels" -}}
helm.sh/chart: {{ include "starwave.chart" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/part-of: starwave
{{- end -}}

{{- define "starwave.selectorLabels" -}}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/part-of: starwave
{{- end -}}

{{- define "starwave.bot.fullname" -}}
{{- if .Values.apps.bot.fullnameOverride -}}
{{- .Values.apps.bot.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $suffix := default "bot" .Values.apps.bot.nameOverride -}}
{{- printf "%s-%s" (include "starwave.fullname" .) $suffix | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "starwave.bot.labels" -}}
app.kubernetes.io/name: {{ include "starwave.bot.fullname" . }}
app.kubernetes.io/component: bot
{{ include "starwave.labels" . }}
{{- end -}}

{{- define "starwave.bot.selectorLabels" -}}
app.kubernetes.io/name: {{ include "starwave.bot.fullname" . }}
app.kubernetes.io/component: bot
{{ include "starwave.selectorLabels" . }}
{{- end -}}

{{- define "starwave.bot.image" -}}
{{- $image := .Values.apps.bot.image -}}
{{- $tag := default .Chart.AppVersion $image.tag -}}
{{- printf "%s:%s" $image.repository $tag -}}
{{- end -}}

{{- define "starwave.bot.serviceAccountName" -}}
{{- $global := .Values.global.serviceAccount -}}
{{- $app := .Values.apps.bot.serviceAccount -}}
{{- $name := default "" $app.name -}}
{{- if eq $name "" }}{{- $name = default "" $global.name -}}{{- end -}}
{{- $create := $global.create | default true -}}
{{- if ne $app.create nil }}{{- $create = $app.create -}}{{- end -}}
{{- if eq $name "" }}
{{- if $create }}{{- printf "%s-sa" (include "starwave.bot.fullname" .) -}}{{- else -}}default{{- end -}}
{{- else -}}
{{- $name -}}
{{- end -}}
{{- end -}}

{{- define "starwave.bot.createServiceAccount" -}}
{{- $global := .Values.global.serviceAccount -}}
{{- $app := .Values.apps.bot.serviceAccount -}}
{{- $create := $global.create | default true -}}
{{- if ne $app.create nil }}{{- $create = $app.create -}}{{- end -}}
{{- $create -}}
{{- end -}}

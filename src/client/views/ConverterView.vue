<template>
  <div class="tool-view">
    <!-- Wizard Stepper -->
    <WizardStepper
      v-model="currentStep"
      :steps="wizardSteps"
      :can-proceed="canProceed"
      :loading="converter.processing.value"
      :disabled="false"
      :next-button-text="nextButtonText"
      :status-message="statusMessage"
      :status-color="statusColor"
      @next="onStepNext"
      @reset="onReset"
    >
      <!-- Step 1: Upload CSV -->
      <template #content-1>
        <div class="step-1-content">
          <v-row class="flex-grow-0" align="stretch">
            <!-- Left: File Upload -->
            <v-col cols="12" md="6" class="d-flex">
              <FileUploadCard
                v-model:file="uploadFile"
                :title="t('views.converter.uploadTitle')"
                accept=".csv,text/csv"
                file-icon="mdi-file-delimited"
                :accept-label="t('views.paypal.acceptLabel')"
                :loading="converter.processing.value"
                class="flex-grow-1"
                @upload="onFileUpload"
              />
            </v-col>

            <!-- Right: CSV Options -->
            <v-col cols="12" md="6" class="d-flex">
              <v-card rounded="lg" class="flex-grow-1">
                <v-card-title class="d-flex align-center justify-space-between py-2">
                  <div class="d-flex align-center">
                    <v-icon class="mr-2" size="small">mdi-cog</v-icon>
                    {{ t('views.converter.csvOptions') }}
                  </div>
                  <div class="d-flex align-center ga-2">
                    <v-btn
                      variant="tonal"
                      size="small"
                      prepend-icon="mdi-folder-open"
                      @click="onLoadFullConfig"
                    >
                      {{ t('common.buttons.loadConfig') }}
                    </v-btn>
                    <input
                      ref="fullConfigFileInput"
                      type="file"
                      accept=".json,application/json"
                      style="display: none"
                      @change="onFullConfigFileSelected"
                    />
                  </div>
                </v-card-title>
                <v-card-text class="pt-0">
                  <v-row dense>
                    <v-col cols="6">
                      <v-select
                        v-model="converter.config.value.csvOptions.delimiter"
                        :items="delimiterOptions"
                        :label="t('common.labels.delimiter')"
                        variant="outlined"
                        density="compact"
                        hide-details
                        @update:model-value="reParseCSV"
                      />
                    </v-col>
                    <v-col cols="6">
                      <v-select
                        v-model="converter.config.value.csvOptions.quoteChar"
                        :items="quoteOptions"
                        :label="t('common.labels.quoteCharacter')"
                        variant="outlined"
                        density="compact"
                        hide-details
                        @update:model-value="reParseCSV"
                      />
                    </v-col>
                    <v-col cols="6">
                      <v-text-field
                        v-model.number="converter.config.value.csvOptions.skipRows"
                        :label="t('common.labels.skipRows')"
                        type="number"
                        min="0"
                        variant="outlined"
                        density="compact"
                        hide-details
                        @update:model-value="reParseCSV"
                      />
                    </v-col>
                    <v-col cols="6" class="d-flex align-center">
                      <v-checkbox
                        v-model="converter.config.value.csvOptions.hasHeader"
                        :label="t('common.labels.firstRowIsHeader')"
                        density="compact"
                        hide-details
                        @update:model-value="reParseCSV"
                      />
                    </v-col>
                  </v-row>
                  <div v-if="converter.parsedCSV.value" class="mt-3">
                    <div class="text-caption text-medium-emphasis">
                      <strong>{{ converter.parsedCSV.value.headers.length }}</strong>
                      {{ t('views.converter.columnsDetected') }}
                    </div>
                    <div
                      class="text-caption text-truncate"
                      :title="
                        converter.parsedCSV.value.headers.join(t('views.converter.commaSeparator'))
                      "
                    >
                      {{
                        converter.parsedCSV.value.headers.join(t('views.converter.commaSeparator'))
                      }}
                    </div>
                  </div>
                </v-card-text>
              </v-card>
            </v-col>
          </v-row>

          <!-- Data Preview Table -->
          <v-card rounded="lg" class="preview-card data-preview-card">
            <v-card-title class="d-flex align-center justify-space-between">
              <div class="d-flex align-center">
                <v-icon class="mr-2">mdi-table</v-icon>
                {{ t('common.labels.dataPreview') }}
              </div>
              <v-chip
                v-if="converter.parsedCSV.value?.rows.length"
                size="small"
                color="success"
                variant="tonal"
              >
                <v-icon start size="small">mdi-table-row</v-icon>
                {{
                  t('views.converter.rowsCount', { count: converter.parsedCSV.value.rows.length })
                }}
              </v-chip>
            </v-card-title>
            <v-card-text>
              <!-- Empty state when no file uploaded -->
              <EmptyState
                v-if="!converter.parsedCSV.value || converter.parsedCSV.value.rows.length === 0"
                icon="mdi-table-question"
                :title="t('common.messages.noDataToPreview')"
                :subtitle="t('views.converter.useUploadArea')"
              />

              <!-- Table when data exists -->
              <template v-else>
                <div class="preview-table-container">
                  <v-table density="compact" class="preview-table">
                    <thead>
                      <tr>
                        <th v-for="header in converter.parsedCSV.value.headers" :key="header">
                          {{ header }}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(row, rowIdx) in previewRows" :key="rowIdx">
                        <td v-for="(cell, cellIdx) in row" :key="cellIdx" class="text-truncate">
                          {{ cell || '—' }}
                        </td>
                      </tr>
                    </tbody>
                  </v-table>
                </div>
                <div
                  v-if="converter.parsedCSV.value.rows.length > 10"
                  class="text-center text-caption text-medium-emphasis pt-3"
                >
                  {{
                    t('views.converter.showingFirstRows', {
                      count: converter.parsedCSV.value.rows.length,
                    })
                  }}
                </div>
              </template>
            </v-card-text>
          </v-card>
        </div>
      </template>

      <!-- Step 2: Configure Mapping -->
      <template #content-2>
        <!-- Toolbar -->
        <v-card rounded="lg" class="mb-3">
          <v-card-text class="d-flex align-center justify-space-between py-2">
            <div class="d-flex align-center ga-3">
              <div class="d-flex align-center">
                <v-icon class="mr-2">mdi-swap-horizontal</v-icon>
                <span class="text-subtitle-1 font-weight-medium">{{
                  t('common.labels.columnMapping')
                }}</span>
              </div>
              <v-menu>
                <template #activator="{ props: menuProps }">
                  <v-btn
                    v-bind="menuProps"
                    variant="tonal"
                    color="primary"
                    size="small"
                    prepend-icon="mdi-plus"
                  >
                    {{ t('common.buttons.addColumn') }}
                  </v-btn>
                </template>
                <v-list density="compact" max-height="400">
                  <v-list-item
                    v-for="column in availableColumns"
                    :key="column.id"
                    @click="converter.addSwimlane(column.id)"
                  >
                    <v-list-item-title>{{ column.label }}</v-list-item-title>
                    <v-list-item-subtitle>{{ column.description }}</v-list-item-subtitle>
                    <template #append>
                      <v-chip v-if="column.required" size="x-small" color="error">
                        {{ t('common.labels.required') }}
                      </v-chip>
                    </template>
                  </v-list-item>
                </v-list>
              </v-menu>
            </div>
            <div class="d-flex align-center ga-2">
              <v-btn icon variant="text" size="small" color="info" @click="showHelpDialog = true">
                <v-icon>mdi-help-circle-outline</v-icon>
                <v-tooltip activator="parent" location="bottom">{{
                  t('common.buttons.howToUse')
                }}</v-tooltip>
              </v-btn>
              <v-btn
                variant="tonal"
                size="small"
                prepend-icon="mdi-content-save"
                @click="onSaveConfig"
              >
                {{ t('common.buttons.saveConfig') }}
              </v-btn>
              <v-btn
                variant="tonal"
                size="small"
                prepend-icon="mdi-folder-open"
                @click="onLoadConfig"
              >
                {{ t('common.buttons.loadConfig') }}
              </v-btn>
              <input
                ref="configFileInput"
                type="file"
                accept=".json,application/json"
                style="display: none"
                @change="onConfigFileSelected"
              />
            </div>
          </v-card-text>
        </v-card>

        <!-- Swimlanes Container -->
        <draggable
          ref="swimlanesContainer"
          :model-value="converter.config.value.swimlanes"
          :group="{ name: 'swimlanes' }"
          item-key="id"
          handle=".swimlane-drag-handle"
          animation="200"
          class="swimlanes-container"
          @update:model-value="converter.reorderSwimlanes"
          @wheel="onSwimlanesWheel"
        >
          <template #item="{ element: swimlane }">
            <SwimlaneCard
              :swimlane="swimlane"
              :source-columns="sourceColumns"
              :preview-value="getSwimlanePreviewValue(swimlane.id)"
              :error="getSwimlaneError(swimlane.id)"
              @update:blocks="(blocks) => converter.updateSwimlaneBlocks(swimlane.id, blocks)"
              @remove="converter.removeSwimlane(swimlane.id)"
            />
          </template>
        </draggable>

        <!-- Help Dialog -->
        <v-dialog v-model="showHelpDialog" max-width="500">
          <v-card rounded="lg">
            <v-card-title class="d-flex align-center">
              <v-icon class="mr-2" color="info">mdi-help-circle</v-icon>
              {{ t('common.help.howToUseColumnMapping') }}
            </v-card-title>
            <v-card-text>
              <v-list density="compact">
                <v-list-item prepend-icon="mdi-numeric-1-circle">
                  <v-list-item-title>{{ t('common.help.configureEachColumn') }}</v-list-item-title>
                  <v-list-item-subtitle>
                    {{ t('common.help.configureEachColumnDesc') }}
                  </v-list-item-subtitle>
                </v-list-item>
                <v-list-item prepend-icon="mdi-numeric-2-circle">
                  <v-list-item-title>{{
                    t('common.help.addTransformationBlocks')
                  }}</v-list-item-title>
                  <v-list-item-subtitle>
                    {{ t('common.help.addTransformationBlocksDesc') }}
                  </v-list-item-subtitle>
                </v-list-item>
                <v-list-item prepend-icon="mdi-numeric-3-circle">
                  <v-list-item-title>{{ t('common.help.dragAndDrop') }}</v-list-item-title>
                  <v-list-item-subtitle>
                    {{ t('common.help.dragAndDropDesc') }}
                  </v-list-item-subtitle>
                </v-list-item>
                <v-list-item prepend-icon="mdi-numeric-4-circle">
                  <v-list-item-title>{{ t('common.help.saveConfiguration') }}</v-list-item-title>
                  <v-list-item-subtitle>
                    {{ t('common.help.saveConfigurationDesc') }}
                  </v-list-item-subtitle>
                </v-list-item>
              </v-list>
            </v-card-text>
            <v-card-actions>
              <v-spacer />
              <v-btn color="primary" variant="text" @click="showHelpDialog = false">
                {{ t('common.buttons.gotIt') }}
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
      </template>

      <!-- Step 3: Preview & Export -->
      <template #content-3>
        <div class="step-3-content">
          <!-- Preview Card -->
          <v-card rounded="lg" class="preview-card">
            <v-card-title class="d-flex align-center justify-space-between">
              <div class="d-flex align-center">
                <v-icon class="mr-2">mdi-eye</v-icon>
                {{ t('common.labels.preview') }}
              </div>
              <v-btn
                variant="text"
                size="small"
                prepend-icon="mdi-refresh"
                @click="() => converter.generatePreview(20)"
              >
                {{ t('common.buttons.refresh') }}
              </v-btn>
            </v-card-title>
            <v-card-text>
              <!-- Stats -->
              <div class="d-flex align-center ga-4 mb-4 flex-shrink-0">
                <v-chip color="primary" variant="tonal">
                  <v-icon start>mdi-table-row</v-icon>
                  {{
                    t('views.converter.inputRows', {
                      count: converter.parsedCSV.value?.rows.length || 0,
                    })
                  }}
                </v-chip>
                <v-chip v-if="converter.preview.value?.removedRows" color="warning" variant="tonal">
                  <v-icon start>mdi-table-row-remove</v-icon>
                  {{
                    t('common.labels.countRowsRemoved', {
                      count: converter.preview.value.removedRows,
                    })
                  }}
                </v-chip>
                <v-chip color="success" variant="tonal">
                  <v-icon start>mdi-table-column</v-icon>
                  {{ t('common.labels.countOutputColumns', { count: enabledColumnCount }) }}
                </v-chip>
              </div>

              <!-- Errors -->
              <v-alert
                v-if="converter.preview.value?.errors.length"
                type="error"
                variant="tonal"
                density="compact"
                class="mb-4 flex-shrink-0"
              >
                <strong>{{
                  t('common.labels.countErrorsDetected', {
                    count: converter.preview.value.errors.length,
                  })
                }}</strong>
                <ul class="mt-2 mb-0">
                  <li v-for="(error, idx) in converter.preview.value.errors.slice(0, 5)" :key="idx">
                    {{ t('common.labels.rowError', { row: error.row, message: error.message }) }}
                  </li>
                </ul>
              </v-alert>

              <!-- Preview Table -->
              <div v-if="converter.preview.value" class="preview-table-container">
                <v-table density="compact" class="preview-table">
                  <thead>
                    <tr>
                      <th v-for="header in converter.preview.value.headers" :key="header">
                        {{ header }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(row, idx) in converter.preview.value.rows" :key="idx">
                      <td v-for="(cell, cellIdx) in row" :key="cellIdx" class="text-truncate">
                        {{ cell || '—' }}
                      </td>
                    </tr>
                  </tbody>
                </v-table>
              </div>

              <EmptyState
                v-else
                icon="mdi-table-off"
                :title="t('common.messages.noPreviewAvailable')"
                :subtitle="t('common.help.configureMappingToPreview')"
              />
            </v-card-text>
          </v-card>

          <v-row align="stretch" class="flex-shrink-0">
            <!-- Export Options -->
            <v-col cols="12" md="6" class="d-flex">
              <v-card rounded="lg" class="flex-grow-1 d-flex flex-column">
                <v-card-title class="d-flex align-center py-3">
                  <v-icon class="mr-2" size="small">mdi-download</v-icon>
                  {{ t('common.buttons.exportCSV') }}
                </v-card-title>
                <v-card-text class="pt-0 flex-grow-1">
                  <v-text-field
                    v-model="exportFilename"
                    :label="t('common.labels.outputFilename')"
                    variant="outlined"
                    density="compact"
                    suffix=".csv"
                    hide-details
                    class="mb-4"
                  />
                  <v-row dense class="mb-4">
                    <v-col cols="6">
                      <v-select
                        v-model="converter.config.value.exportOptions.delimiter"
                        :items="delimiterOptions"
                        :label="t('common.labels.delimiter')"
                        variant="outlined"
                        density="compact"
                        hide-details
                      />
                    </v-col>
                    <v-col cols="6">
                      <v-select
                        v-model="converter.config.value.exportOptions.quoteChar"
                        :items="quoteCharOptions"
                        :label="t('common.labels.quoteCharacter')"
                        variant="outlined"
                        density="compact"
                        hide-details
                      />
                    </v-col>
                    <v-col cols="6">
                      <v-select
                        v-model="converter.config.value.exportOptions.quoteMode"
                        :items="quoteModeOptions"
                        :label="t('components.converter.quoting')"
                        variant="outlined"
                        density="compact"
                        hide-details
                      />
                    </v-col>
                    <v-col cols="6">
                      <v-select
                        v-model="converter.config.value.exportOptions.lineEnding"
                        :items="lineEndingOptions"
                        :label="t('components.converter.lineEnding.label')"
                        variant="outlined"
                        density="compact"
                        hide-details
                      />
                    </v-col>
                  </v-row>
                </v-card-text>
                <v-card-actions class="pa-4 pt-0">
                  <v-btn
                    color="primary"
                    variant="flat"
                    size="large"
                    block
                    prepend-icon="mdi-download"
                    @click="onDownloadCSV"
                  >
                    {{ t('common.buttons.downloadCSV') }}
                  </v-btn>
                </v-card-actions>
              </v-card>
            </v-col>

            <!-- Import to Firefly -->
            <v-col cols="12" md="6">
              <v-card rounded="lg">
                <v-card-title class="d-flex align-center py-3">
                  <v-icon class="mr-2" size="small">mdi-cloud-upload</v-icon>
                  {{ t('views.converter.importToFirefly') }}
                </v-card-title>
                <v-card-text class="pt-0">
                  <!-- Import Options -->
                  <v-text-field
                    v-model="importOptions.tags"
                    :label="t('views.converter.addTags')"
                    :placeholder="t('views.converter.tagsPlaceholder')"
                    :hint="t('views.converter.tagsHint')"
                    persistent-hint
                    variant="outlined"
                    density="compact"
                    prepend-inner-icon="mdi-tag-multiple"
                    class="mb-4"
                  />

                  <v-row dense class="mb-4">
                    <v-col cols="6">
                      <v-checkbox
                        v-model="importOptions.applyRules"
                        :label="t('views.converter.applyRules')"
                        density="compact"
                        hide-details
                      />
                    </v-col>
                    <v-col cols="6">
                      <v-checkbox
                        v-model="importOptions.errorIfDuplicate"
                        :label="t('common.labels.skipDuplicates')"
                        density="compact"
                        hide-details
                      />
                    </v-col>
                  </v-row>

                  <!-- Validation Status -->
                  <v-alert
                    v-if="importValidation?.valid"
                    type="success"
                    variant="tonal"
                    density="compact"
                    class="mb-4"
                  >
                    {{
                      t('common.labels.readyToImportCount', {
                        count: importValidation.summary.validRows,
                      })
                    }}
                  </v-alert>

                  <v-alert
                    v-else-if="importValidation"
                    type="error"
                    variant="tonal"
                    density="compact"
                    class="mb-4"
                  >
                    <div class="font-weight-medium mb-1">
                      {{ t('views.converter.cannotImport') }}
                    </div>
                    <ul class="mb-0 pl-4">
                      <li
                        v-for="(err, idx) in importValidation.errors.slice(0, 5)"
                        :key="idx"
                        class="text-body-2"
                      >
                        {{ err.message }}
                      </li>
                    </ul>
                  </v-alert>

                  <v-alert
                    v-if="importValidation && importValidation.warnings.length > 0"
                    type="warning"
                    variant="tonal"
                    density="compact"
                    class="mb-4"
                  >
                    <ul class="mb-0 pl-4">
                      <li
                        v-for="(warn, idx) in importValidation.warnings"
                        :key="idx"
                        class="text-body-2"
                      >
                        {{ warn.message }}
                      </li>
                    </ul>
                  </v-alert>

                  <!-- Summary chips (only show when there are issues) -->
                  <div
                    v-if="
                      importValidation &&
                      (importValidation.summary.rowsWithErrors ||
                        importValidation.summary.rowsRemoved)
                    "
                    class="d-flex flex-wrap ga-2 mb-4"
                  >
                    <v-chip
                      size="small"
                      :color="importValidation.valid ? 'success' : 'grey'"
                      variant="tonal"
                    >
                      <v-icon start size="small">mdi-check</v-icon>
                      {{
                        t('views.converter.validRows', {
                          count: importValidation.summary.validRows,
                        })
                      }}
                    </v-chip>
                    <v-chip
                      v-if="importValidation.summary.rowsWithErrors"
                      size="small"
                      color="error"
                      variant="tonal"
                    >
                      <v-icon start size="small">mdi-alert</v-icon>
                      {{
                        t('views.converter.rowsWithErrors', {
                          count: importValidation.summary.rowsWithErrors,
                        })
                      }}
                    </v-chip>
                    <v-chip
                      v-if="importValidation.summary.rowsRemoved"
                      size="small"
                      color="warning"
                      variant="tonal"
                    >
                      <v-icon start size="small">mdi-minus</v-icon>
                      {{
                        t('common.labels.countRowsRemoved', {
                          count: importValidation.summary.rowsRemoved,
                        })
                      }}
                    </v-chip>
                  </div>
                </v-card-text>
                <v-card-actions class="pa-4 pt-0">
                  <v-btn
                    color="success"
                    variant="flat"
                    size="large"
                    block
                    :disabled="!importValidation?.valid || converter.processing.value"
                    :loading="converter.processing.value"
                    prepend-icon="mdi-cloud-upload"
                    @click="showImportDialog = true"
                  >
                    {{ t('views.converter.importToFirefly') }}
                  </v-btn>
                </v-card-actions>
              </v-card>
            </v-col>
          </v-row>
        </div>
      </template>
    </WizardStepper>

    <!-- Import Confirmation Dialog -->
    <v-dialog v-model="showImportDialog" max-width="500" persistent>
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center">
          <v-icon class="mr-2" color="success">mdi-cloud-upload</v-icon>
          {{ t('common.buttons.confirmImport') }}
        </v-card-title>
        <v-card-text>
          <p class="mb-4">
            {{
              t('views.converter.confirmImportText', {
                count: importValidation?.summary.validRows || 0,
              })
            }}
          </p>

          <!-- Import settings summary -->
          <div class="d-flex flex-wrap ga-2 mb-4">
            <v-chip v-if="importOptions.tags" size="small" color="primary" variant="tonal">
              <v-icon start size="small">mdi-tag</v-icon>
              {{ t('common.labels.tags') }}: {{ importOptions.tags }}
            </v-chip>
            <v-chip
              size="small"
              :color="importOptions.applyRules ? 'success' : 'grey'"
              variant="tonal"
            >
              <v-icon start size="small">{{
                importOptions.applyRules ? 'mdi-check' : 'mdi-close'
              }}</v-icon>
              {{ t('common.labels.rules') }}
            </v-chip>
            <v-chip
              size="small"
              :color="importOptions.errorIfDuplicate ? 'success' : 'warning'"
              variant="tonal"
            >
              <v-icon start size="small">{{
                importOptions.errorIfDuplicate ? 'mdi-check' : 'mdi-close'
              }}</v-icon>
              {{ t('common.labels.skipDuplicates') }}
            </v-chip>
          </div>

          <!-- Progress -->
          <div v-if="converter.importProgress.value" class="mb-4">
            <v-progress-linear
              :model-value="
                (converter.importProgress.value.current / converter.importProgress.value.total) *
                100
              "
              color="success"
              height="8"
              rounded
              class="mb-2"
            />
            <div class="text-caption text-center text-medium-emphasis">
              {{
                t('views.converter.progressText', {
                  current: converter.importProgress.value.current,
                  total: converter.importProgress.value.total,
                })
              }}
            </div>
          </div>

          <v-alert
            v-if="!importOptions.errorIfDuplicate"
            type="warning"
            variant="tonal"
            density="compact"
          >
            <strong>{{ t('common.labels.warning') }}:</strong>
            {{ t('views.converter.duplicateWarning') }}
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            variant="text"
            :disabled="converter.processing.value"
            @click="showImportDialog = false"
          >
            {{ t('common.buttons.cancel') }}
          </v-btn>
          <v-btn
            color="success"
            variant="flat"
            :loading="converter.processing.value"
            @click="onImportToFirefly"
          >
            {{ t('common.buttons.import') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Import Results Dialog -->
    <v-dialog v-model="showImportResultsDialog" max-width="500">
      <v-card rounded="lg">
        <v-card-title class="d-flex align-center">
          <v-icon class="mr-2" :color="importResults?.failed === 0 ? 'success' : 'warning'">
            {{ importResults?.failed === 0 ? 'mdi-check-circle' : 'mdi-alert-circle' }}
          </v-icon>
          {{ t('common.messages.importComplete') }}
        </v-card-title>
        <v-card-text>
          <div class="d-flex ga-4 mb-4">
            <v-chip color="success" variant="tonal">
              <v-icon start>mdi-check</v-icon>
              {{ t('views.converter.imported', { count: importResults?.successful || 0 }) }}
            </v-chip>
            <v-chip v-if="importResults?.failed" color="error" variant="tonal">
              <v-icon start>mdi-alert</v-icon>
              {{ t('views.converter.failed', { count: importResults.failed }) }}
            </v-chip>
          </div>

          <v-alert
            v-if="importResults?.errors?.length"
            type="error"
            variant="tonal"
            density="compact"
          >
            <div class="font-weight-medium mb-1">{{ t('common.labels.errors') }}:</div>
            <ul class="mb-0 pl-4" style="max-height: 200px; overflow-y: auto">
              <li
                v-for="(err, idx) in importResults.errors.slice(0, 20)"
                :key="idx"
                class="text-body-2"
              >
                {{ err }}
              </li>
              <li v-if="importResults.errors.length > 20" class="text-body-2 font-italic">
                {{ t('common.labels.andMore', { count: importResults.errors.length - 20 }) }}
              </li>
            </ul>
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn color="primary" variant="flat" @click="showImportResultsDialog = false">
            {{ t('common.buttons.close') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Error Snackbar -->
    <v-snackbar v-model="showError" color="error" :timeout="5000">
      {{ converter.error.value }}
      <template #actions>
        <v-btn variant="text" @click="showError = false">{{ t('common.buttons.close') }}</v-btn>
      </template>
    </v-snackbar>

    <!-- Success Snackbar -->
    <v-snackbar v-model="showSuccess" color="success" :timeout="3000">
      {{ successMessage }}
      <template #actions>
        <v-btn variant="text" @click="showSuccess = false">{{ t('common.buttons.close') }}</v-btn>
      </template>
    </v-snackbar>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useI18n } from 'vue-i18n';
import draggable from 'vuedraggable';
import { WizardStepper, FileUploadCard, EmptyState } from '../components/common';
import { SwimlaneCard } from '../components/converter';
import { useConverter } from '../composables/useConverter';
import { FIREFLY_COLUMNS } from '@shared/types/converter';

const { t } = useI18n();

// Wizard state
const currentStep = ref(1);
const wizardSteps = computed(() => [
  { title: t('common.steps.uploadCSV'), subtitle: t('common.steps.selectBankExport') },
  { title: t('common.steps.configureMapping'), subtitle: t('common.steps.mapColumns') },
  { title: t('common.steps.previewExport'), subtitle: t('common.steps.reviewAndDownload') },
]);

// Converter composable
const converter = useConverter();

// File upload state
const uploadFile = ref<File[]>([]);
const configFileInput = ref<HTMLInputElement | null>(null);
const fullConfigFileInput = ref<HTMLInputElement | null>(null);
const swimlanesContainer = ref<InstanceType<typeof draggable> | null>(null);

// Export state
const exportFilename = ref('firefly-import');

// Import options
function getDefaultImportTag(): string {
  const now = new Date();
  const date = now.toLocaleDateString('en-CA'); // YYYY-MM-DD format
  const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); // HH:MM format
  return t('views.converter.defaultImportTag', { date, time });
}

const importOptions = ref({
  tags: getDefaultImportTag(),
  applyRules: true,
  errorIfDuplicate: true,
});

// UI state
const showError = ref(false);
const showSuccess = ref(false);
const successMessage = ref('');
const showHelpDialog = ref(false);
const showImportDialog = ref(false);
const showImportResultsDialog = ref(false);
const importResults = ref<{ successful: number; failed: number; errors: string[] } | null>(null);

// Watch for errors
watch(
  () => converter.error.value,
  (error) => {
    if (error) {
      showError.value = true;
    }
  }
);

// CSV options
const delimiterOptions = computed(() => [
  { title: t('common.csvOptions.comma'), value: ',' },
  { title: t('common.csvOptions.semicolon'), value: ';' },
  { title: t('common.csvOptions.tab'), value: '\t' },
  { title: t('common.csvOptions.pipe'), value: '|' },
]);

const quoteCharOptions = computed(() => [
  { title: t('common.csvOptions.doubleQuote'), value: '"' },
  { title: t('common.csvOptions.singleQuote'), value: "'" },
]);

const quoteModeOptions = computed(() => [
  { title: t('components.converter.quoteMode.needed'), value: 'needed' },
  { title: t('common.csvOptions.always'), value: 'always' },
  { title: t('common.csvOptions.never'), value: 'never' },
]);

const lineEndingOptions = computed(() => [
  { title: t('components.converter.lineEnding.lf'), value: 'lf' },
  { title: t('components.converter.lineEnding.crlf'), value: 'crlf' },
]);

const quoteOptions = computed(() => [
  { title: t('common.csvOptions.doubleQuote'), value: '"' },
  { title: t('common.csvOptions.singleQuote'), value: "'" },
]);

// Computed
const hasSwimlaneErrors = computed(() => {
  return converter.preview.value && Object.keys(converter.preview.value.swimlaneErrors).length > 0;
});

const canProceed = computed(() => {
  switch (currentStep.value) {
    case 1:
      return converter.parsedCSV.value !== null && converter.parsedCSV.value.rows.length > 0;
    case 2:
      // Block proceeding if there are swimlane errors
      return (
        converter.config.value.swimlanes.some((s) => s.enabled && s.blocks.length > 0) &&
        !hasSwimlaneErrors.value
      );
    case 3:
      return true;
    default:
      return false;
  }
});

const nextButtonText = computed(() => {
  switch (currentStep.value) {
    case 1:
      return t('common.steps.configureMapping');
    case 2:
      return t('common.steps.previewExport');
    default:
      return t('common.buttons.next');
  }
});

const statusMessage = computed(() => {
  if (currentStep.value === 1) {
    if (converter.processing.value) return t('common.status.parsing');
    if (!converter.parsedCSV.value) return '';
    return t('views.converter.rowsColumns', {
      rows: converter.parsedCSV.value.rows.length,
      columns: converter.parsedCSV.value.headers.length,
    });
  }
  return '';
});

const statusColor = computed(() => {
  if (currentStep.value === 1 && converter.parsedCSV.value) {
    return converter.parsedCSV.value.rows.length > 0 ? 'success' : 'warning';
  }
  return '';
});

const previewRows = computed(() => {
  return converter.parsedCSV.value?.rows.slice(0, 10) || [];
});

const sourceColumns = computed(() => {
  return converter.parsedCSV.value?.headers || [];
});

const availableColumns = computed(() => {
  const usedColumns = converter.config.value.swimlanes.map((s) => s.targetColumn);
  return FIREFLY_COLUMNS.filter((c) => !usedColumns.includes(c.id));
});

const enabledColumnCount = computed(() => {
  return converter.config.value.swimlanes.filter((s) => s.enabled).length;
});

// Import validation - computed so it updates automatically
const importValidation = computed(() => {
  if (!converter.parsedCSV.value || currentStep.value !== 3) {
    return null;
  }
  // Access these to ensure reactivity when config changes
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  converter.config.value.swimlanes;
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  converter.preview.value;
  return converter.validateForImport();
});

// Get preview value for a specific swimlane by ID
function getSwimlanePreviewValue(swimlaneId: string): string | undefined {
  if (!converter.preview.value) {
    return undefined;
  }
  return converter.preview.value.swimlanePreviewValues[swimlaneId];
}

// Get error for a specific swimlane by ID
function getSwimlaneError(swimlaneId: string) {
  if (!converter.preview.value) {
    return undefined;
  }
  return converter.preview.value.swimlaneErrors[swimlaneId];
}

// Horizontal scroll with mouse wheel for swimlanes
function onSwimlanesWheel(event: WheelEvent) {
  if (!swimlanesContainer.value?.$el) return;

  // Check if the event target is inside a blocks-container that can scroll vertically
  const target = event.target as HTMLElement;
  const blocksContainer = target.closest('.blocks-container') as HTMLElement | null;

  if (blocksContainer) {
    // Check if the blocks container has vertical scroll room
    const canScrollUp = blocksContainer.scrollTop > 0;
    const canScrollDown =
      blocksContainer.scrollTop < blocksContainer.scrollHeight - blocksContainer.clientHeight;

    // If scrolling down and can scroll down, or scrolling up and can scroll up, let it scroll naturally
    if ((event.deltaY > 0 && canScrollDown) || (event.deltaY < 0 && canScrollUp)) {
      return; // Don't intercept - let vertical scroll happen
    }
  }

  // Check if we need horizontal scrolling (content wider than container)
  const container = swimlanesContainer.value.$el as HTMLElement;
  if (container.scrollWidth <= container.clientWidth) return;

  // Convert vertical scroll to horizontal
  if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
    event.preventDefault();
    container.scrollLeft += event.deltaY;
  }
}

// File upload handler
async function onFileUpload(file: File | File[] | null) {
  if (!file || (Array.isArray(file) && file.length === 0)) {
    return;
  }
  const f = Array.isArray(file) ? file[0] : file;
  await converter.parseCSV(f);
}

// Re-parse CSV with new options
async function reParseCSV() {
  // Wait for Vue to finish updating the reactive values
  await nextTick();
  if (converter.currentFile.value) {
    await converter.parseCSV(converter.currentFile.value, {
      delimiter: converter.config.value.csvOptions.delimiter,
      hasHeader: converter.config.value.csvOptions.hasHeader,
      skipRows: converter.config.value.csvOptions.skipRows,
    });
  }
}

// Step navigation
function onStepNext(step: number) {
  if (step === 2) {
    converter.generatePreview(5);
  } else if (step === 3) {
    converter.generatePreview(20);
  }
}

function onReset() {
  currentStep.value = 1;
  uploadFile.value = [];
  converter.reset();
}

// Config save/load
function onSaveConfig() {
  const json = converter.saveConfig();
  const blob = new Blob([json], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${converter.config.value.name.toLowerCase().replace(/\s+/g, '-')}.json`;
  link.click();
  URL.revokeObjectURL(link.href);

  successMessage.value = t('views.converter.configSaved');
  showSuccess.value = true;
}

function onLoadConfig() {
  configFileInput.value?.click();
}

async function onConfigFileSelected(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    const json = await file.text();
    converter.loadConfig(json);
    successMessage.value = t('views.converter.configLoaded');
    showSuccess.value = true;
  }
  // Reset input
  target.value = '';
}

// Load full config from step 1
function onLoadFullConfig() {
  fullConfigFileInput.value?.click();
}

async function onFullConfigFileSelected(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (file) {
    const json = await file.text();
    converter.loadConfig(json);
    successMessage.value = t('views.converter.configLoadedWithOptions');
    showSuccess.value = true;
    // Re-parse CSV with new options if we have a file
    await reParseCSV();
  }
  // Reset input
  target.value = '';
}

// Download CSV
function onDownloadCSV() {
  try {
    converter.downloadCSV(`${exportFilename.value}.csv`);
    successMessage.value = t('views.converter.csvDownloaded');
    showSuccess.value = true;
  } catch (e) {
    converter.error.value = e instanceof Error ? e.message : t('views.converter.failedToDownload');
  }
}

// Import to Firefly III
async function onImportToFirefly() {
  try {
    importResults.value = await converter.importToFirefly({
      tags: importOptions.value.tags,
      applyRules: importOptions.value.applyRules,
      errorIfDuplicate: importOptions.value.errorIfDuplicate,
    });
    showImportDialog.value = false;
    showImportResultsDialog.value = true;

    if (importResults.value.failed === 0) {
      successMessage.value = t('views.converter.successfullyImported', {
        count: importResults.value.successful,
      });
      showSuccess.value = true;
    }
  } catch (e) {
    converter.error.value = e instanceof Error ? e.message : t('views.converter.failedToImport');
    showImportDialog.value = false;
  }
}
</script>

<style scoped>
.tool-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
}

.swimlanes-container {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 4px 0 0 0;
  scroll-behavior: smooth;
  flex: 1;
  min-height: 0;
  align-items: stretch;
  height: calc(100vh - 248px); /* Account for header, toolbar card, stepper controls */
  min-height: 300px;
}

/* Custom scrollbar for swimlanes */
.swimlanes-container::-webkit-scrollbar {
  height: 8px;
}

.swimlanes-container::-webkit-scrollbar-track {
  background: rgba(var(--v-border-color), 0.1);
  border-radius: 4px;
}

.swimlanes-container::-webkit-scrollbar-thumb {
  background: rgba(var(--v-border-color), 0.3);
  border-radius: 4px;
}

.swimlanes-container::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--v-border-color), 0.5);
}

.preview-table-container {
  overflow: auto;
  border: 1px solid rgba(var(--v-border-color), 0.2);
  border-radius: 8px;
  min-height: 100px;
}

.step-1-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 16px;
}

.step-3-content {
  display: grid;
  grid-template-rows: 1fr auto;
  height: 100%;
  gap: 16px;
}

.preview-card {
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.preview-card :deep(.v-card-text) {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.preview-card .preview-table-container {
  flex: 1;
}

.preview-table {
  min-width: 100%;
}

.preview-table th {
  background: rgb(var(--v-theme-surface));
  border-bottom: 1px solid rgba(var(--v-border-color), 0.3);
  position: sticky;
  top: 0;
  z-index: 1;
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
}

.preview-table td {
  max-width: 200px;
}

/* Data preview table in step 1 */
.data-preview-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 200px;
}
</style>

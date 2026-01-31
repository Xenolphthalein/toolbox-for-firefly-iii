<template>
  <div class="tool-view">
    <!-- Wizard Stepper -->
    <WizardStepper
      v-model="currentStep"
      :steps="wizardSteps"
      :can-proceed="canProceed"
      :loading="stepLoading"
      :disabled="connecting || fetching"
      :next-button-text="nextButtonText"
      :status-message="statusMessage"
      :status-color="statusColor"
      @next="onStepNext"
      @reset="onReset"
    >
      <!-- Step 1: Connect, Configure & Fetch -->
      <template #content-1>
        <div class="step-1-content">
          <!-- Combined Connection Card -->
          <v-card rounded="lg" class="flex-shrink-0">
            <v-card-title class="d-flex align-center justify-space-between py-2">
              <div class="d-flex align-center">
                <v-icon class="mr-2" size="small">mdi-bank</v-icon>
                {{ t('views.fints.bankConnection') }}
              </div>
              <div class="d-flex align-center ga-2">
                <v-btn
                  variant="tonal"
                  size="small"
                  prepend-icon="mdi-folder-open"
                  :disabled="connecting || dialogState !== null"
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
            <v-card-text class="pa-4 pt-0">
              <v-row>
                <!-- Left: Bank Connection -->
                <v-col cols="12" md="6" class="pr-md-6">
                  <div class="text-subtitle-2 text-medium-emphasis mb-2 d-flex align-center">
                    <v-icon size="small" class="mr-1">mdi-domain</v-icon>
                    {{ t('views.fints.bankSelection') }}
                  </div>
                  <v-autocomplete
                    v-model="selectedBank"
                    :items="knownBanks"
                    item-title="name"
                    item-value="blz"
                    :label="t('views.fints.selectBank')"
                    variant="outlined"
                    density="compact"
                    clearable
                    return-object
                    hide-details
                    class="mb-4"
                    :disabled="connecting || dialogState !== null"
                    @update:model-value="onBankSelected"
                  >
                    <template #item="{ item, props: itemProps }">
                      <v-list-item v-bind="itemProps">
                        <v-list-item-subtitle
                          >{{ t('common.labels.blz') }}: {{ item.raw.blz }}</v-list-item-subtitle
                        >
                      </v-list-item>
                    </template>
                  </v-autocomplete>
                  <v-row dense>
                    <v-col cols="4">
                      <v-text-field
                        v-model="bankConfig.bankCode"
                        label="BLZ"
                        variant="outlined"
                        density="compact"
                        hide-details
                        :disabled="connecting || dialogState !== null"
                      />
                    </v-col>
                    <v-col cols="8">
                      <v-text-field
                        v-model="bankConfig.url"
                        :label="t('common.labels.fintsServerUrl')"
                        variant="outlined"
                        density="compact"
                        hide-details
                        :disabled="connecting || dialogState !== null"
                      />
                    </v-col>
                  </v-row>
                </v-col>

                <!-- Right: Credentials & Options -->
                <v-col cols="12" md="6" class="pl-md-6">
                  <div class="text-subtitle-2 text-medium-emphasis mb-2 d-flex align-center">
                    <v-icon size="small" class="mr-1">mdi-account-key</v-icon>
                    {{ t('views.fints.loginData') }}
                  </div>
                  <v-row dense class="mb-2">
                    <v-col cols="6">
                      <v-text-field
                        v-model="bankConfig.userId"
                        :label="t('common.labels.userId')"
                        variant="outlined"
                        density="compact"
                        hide-details
                        :disabled="connecting || dialogState !== null"
                      />
                    </v-col>
                    <v-col cols="6">
                      <v-text-field
                        v-model="bankConfig.pin"
                        label="PIN"
                        variant="outlined"
                        density="compact"
                        type="password"
                        hide-details
                        :disabled="connecting || dialogState !== null"
                      />
                    </v-col>
                  </v-row>

                  <!-- Account & Date Range (always visible, disabled when not connected) -->
                  <v-row dense>
                    <v-col cols="12" md="6">
                      <v-select
                        v-model="selectedAccountIndex"
                        :items="accountOptions"
                        item-title="label"
                        item-value="value"
                        :label="t('common.labels.account')"
                        variant="outlined"
                        density="compact"
                        hide-details
                        :disabled="!dialogState || fetching"
                      />
                    </v-col>
                    <v-col cols="6" md="3">
                      <v-text-field
                        v-model="startDate"
                        :label="t('common.labels.from')"
                        type="date"
                        variant="outlined"
                        density="compact"
                        hide-details
                        :disabled="!dialogState || fetching"
                      />
                    </v-col>
                    <v-col cols="6" md="3">
                      <v-text-field
                        v-model="endDate"
                        :label="t('common.labels.to')"
                        type="date"
                        variant="outlined"
                        density="compact"
                        hide-details
                        :disabled="!dialogState || fetching"
                      />
                    </v-col>
                  </v-row>
                </v-col>
              </v-row>
            </v-card-text>
            <v-card-actions class="px-4 pb-3 pt-0">
              <v-btn
                variant="text"
                color="error"
                size="small"
                :disabled="!dialogState"
                @click="disconnect"
              >
                {{ t('common.buttons.disconnect') }}
              </v-btn>
              <v-spacer />
              <v-btn
                v-if="!dialogState"
                color="primary"
                variant="flat"
                prepend-icon="mdi-connection"
                :loading="connecting"
                :disabled="!canConnect"
                @click="connect"
              >
                {{ t('common.buttons.connect') }}
              </v-btn>
              <v-btn
                v-else
                color="primary"
                variant="flat"
                prepend-icon="mdi-download"
                :loading="fetching"
                :disabled="!canFetch"
                @click="fetchTransactions"
              >
                {{ t('common.buttons.fetchTransactions') }}
              </v-btn>
            </v-card-actions>
          </v-card>

          <!-- Data Preview Table -->
          <v-card rounded="lg" class="preview-card data-preview-card">
            <v-card-title class="d-flex align-center justify-space-between py-2">
              <div class="d-flex align-center">
                <v-icon class="mr-2" size="small">mdi-table</v-icon>
                {{ t('common.labels.dataPreview') }}
              </div>
              <v-chip v-if="fintsTransactions.length" size="small" color="success" variant="tonal">
                <v-icon start size="small">mdi-table-row</v-icon>
                {{ t('views.fints.transactionsCount', { count: fintsTransactions.length }) }}
              </v-chip>
            </v-card-title>
            <v-card-text class="pt-0">
              <!-- Progress during fetch -->
              <div v-if="fetching" class="d-flex flex-column align-center py-8">
                <v-progress-circular indeterminate color="primary" size="48" class="mb-4" />
                <div class="text-body-1">{{ progress.message.value }}</div>
              </div>

              <!-- Empty state -->
              <EmptyState
                v-else-if="fintsTransactions.length === 0"
                icon="mdi-bank-transfer"
                :title="t('common.messages.noTransactionsLoaded')"
                :subtitle="t('common.messages.connectToBankToPreview')"
              />

              <!-- Table when data exists -->
              <template v-else>
                <div class="preview-table-container">
                  <v-table density="compact" class="preview-table">
                    <thead>
                      <tr>
                        <th v-for="header in previewHeaders" :key="header">{{ header }}</th>
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
                  v-if="fintsTransactions.length > 10"
                  class="text-center text-caption text-medium-emphasis pt-3"
                >
                  {{
                    t('common.labels.showingFirst10Transactions', {
                      total: fintsTransactions.length,
                    })
                  }}
                </div>
              </template>
            </v-card-text>
          </v-card>
        </div>

        <!-- TAN Input Dialog -->
        <v-dialog v-model="showTanDialog" max-width="400" persistent>
          <v-card rounded="lg" class="text-center">
            <v-card-text class="pa-6">
              <!-- Decoupled TAN (app-based) -->
              <template v-if="isDecoupledTan">
                <v-progress-circular
                  indeterminate
                  color="primary"
                  size="80"
                  width="6"
                  class="mb-5"
                />
                <div class="text-h6 mb-2">{{ t('common.messages.waitingForConfirmation') }}</div>
                <div class="text-body-2 text-medium-emphasis mb-4">
                  {{ tanRequest?.challengeText || t('common.messages.pleaseConfirmInBankingApp') }}
                </div>
              </template>

              <!-- Manual TAN entry -->
              <template v-else>
                <v-icon size="64" color="warning" class="mb-4">mdi-shield-key-outline</v-icon>
                <div class="text-h6 mb-4">{{ t('common.labels.enterTan') }}</div>
                <v-text-field
                  v-model="tanInput"
                  label="TAN"
                  variant="outlined"
                  autofocus
                  hide-details
                  class="mb-2"
                  :loading="submittingTan"
                  @keyup.enter="submitTan"
                />
                <div v-if="tanRequest?.challengeText" class="text-caption text-medium-emphasis">
                  {{ tanRequest.challengeText }}
                </div>
              </template>
            </v-card-text>
            <v-card-actions class="px-6 pb-4 pt-0">
              <v-btn
                variant="text"
                block
                :disabled="submittingTan || pollingTan"
                @click="cancelTan"
              >
                {{ t('common.buttons.cancel') }}
              </v-btn>
              <v-btn
                v-if="!isDecoupledTan"
                color="primary"
                variant="flat"
                block
                :loading="submittingTan"
                :disabled="!tanInput"
                @click="submitTan"
              >
                {{ t('common.buttons.submit') }}
              </v-btn>
            </v-card-actions>
          </v-card>
        </v-dialog>
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
              @update:blocks="
                (blocks: TransformBlock[]) => converter.updateSwimlaneBlocks(swimlane.id, blocks)
              "
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
                    {{ t('views.fints.help.step1Text') }}
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
                  <v-list-item-title>{{ t('common.help.saveConfiguration') }}</v-list-item-title>
                  <v-list-item-subtitle>
                    {{ t('views.fints.help.step4Text') }}
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
                  {{ t('views.fints.inputTransactions', { count: fintsTransactions.length }) }}
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
                        :label="t('views.fints.quote')"
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
                  {{ t('views.fints.importToFirefly') }}
                </v-card-title>
                <v-card-text class="pt-0">
                  <!-- Import Options -->
                  <v-text-field
                    v-model="importOptions.tags"
                    :label="t('views.fints.addTags')"
                    :placeholder="t('views.fints.tagsPlaceholder')"
                    :hint="t('views.fints.tagsHint')"
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
                        :label="t('views.fints.applyRules')"
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
                      {{ t('views.fints.cannotImportValidation') }}
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
                </v-card-text>
                <v-card-actions class="pa-4 pt-0">
                  <v-btn
                    color="success"
                    variant="flat"
                    size="large"
                    block
                    prepend-icon="mdi-database-import"
                    :loading="importing"
                    :disabled="!importValidation?.valid"
                    @click="showImportDialog = true"
                  >
                    {{ t('views.fints.importToFirefly') }}
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
            {{ t('views.fints.thisWillCreate') }}
            <strong>{{ importValidation?.summary.validRows || 0 }}</strong>
            {{ t('views.fints.transactionsInFirefly') }}
          </p>

          <!-- Import settings summary -->
          <div class="d-flex flex-wrap ga-2 mb-4">
            <v-chip v-if="importOptions.tags" size="small" color="primary" variant="tonal">
              <v-icon start size="small">mdi-tag</v-icon>
              {{ t('views.fints.tagsLabel', { tags: importOptions.tags }) }}
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
                t('views.fints.transactionsProgress', {
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
            {{ t('views.fints.duplicateWarningDisabled') }}
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" :disabled="importing" @click="showImportDialog = false">
            {{ t('common.buttons.cancel') }}
          </v-btn>
          <v-btn color="success" variant="flat" :loading="importing" @click="onImportToFirefly">
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
              {{ t('views.fints.imported', { count: importResults?.successful || 0 }) }}
            </v-chip>
            <v-chip v-if="importResults?.failed" color="error" variant="tonal">
              <v-icon start>mdi-close</v-icon>
              {{ t('views.fints.failed', { count: importResults.failed }) }}
            </v-chip>
          </div>

          <v-alert
            v-if="importResults?.errors.length"
            type="error"
            variant="tonal"
            density="compact"
          >
            <div class="font-weight-medium mb-2">{{ t('common.labels.errors') }}:</div>
            <ul class="mb-0 pl-4">
              <li
                v-for="(err, idx) in importResults.errors.slice(0, 10)"
                :key="idx"
                class="text-body-2"
              >
                {{ err }}
              </li>
            </ul>
            <div v-if="importResults.errors.length > 10" class="text-caption mt-2">
              {{ t('views.fints.andMoreErrors', { count: importResults.errors.length - 10 }) }}
            </div>
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="flat" color="primary" @click="showImportResultsDialog = false">
            {{ t('common.buttons.close') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import { onBeforeRouteLeave } from 'vue-router';
import draggable from 'vuedraggable';
import api from '../services/api';
import type {
  FinTSAccount,
  FinTSDialogState,
  FinTSTanRequest,
  FinTSTanMethod,
  FinTSTransaction,
} from '@shared/types/app';
import type { ImportValidation } from '@shared/types/converter';
import { FIREFLY_COLUMNS } from '@shared/types/converter';
import { WizardStepper, EmptyState } from '../components';
import { SwimlaneCard } from '../components/converter';
import { useProgress, useConverter, useSnackbar } from '../composables';

// Types for bank list
interface KnownBank {
  blz: string;
  name: string;
  url: string;
}

const { t } = useI18n();

// Wizard state
const currentStep = ref(1);
const wizardSteps = computed(() => [
  { title: t('common.steps.connectFetch'), subtitle: t('common.steps.loadBankTransactions') },
  {
    title: t('views.fints.steps.transform.title'),
    subtitle: t('views.fints.steps.transform.subtitle'),
  },
  { title: t('common.steps.previewExport'), subtitle: t('common.steps.reviewAndImport') },
]);

// Step 1: Connection state
const knownBanks = ref<KnownBank[]>([]);
const selectedBank = ref<KnownBank | null>(null);
const bankConfig = reactive({
  bankCode: '',
  url: '',
  userId: '',
  pin: '',
});
const connecting = ref(false);
const dialogState = ref<FinTSDialogState | null>(null);
const selectedAccountIndex = ref(0);

// TAN handling
const showTanDialog = ref(false);
const tanRequest = ref<FinTSTanRequest | null>(null);
const tanInput = ref('');
const submittingTan = ref(false);
const pollingTan = ref(false);
const pollingInterval = ref<ReturnType<typeof setInterval> | null>(null);
const availableTanMethods = ref<FinTSTanMethod[]>([]);
const selectedTanMethodId = ref<string>('');

// Date range
const startDate = ref<string>();
const endDate = ref<string>();

// Initialize dates to last 30 days
const today = new Date();
const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
endDate.value = today.toISOString().split('T')[0];
startDate.value = thirtyDaysAgo.toISOString().split('T')[0];

// Transaction data
const fetching = ref(false);
const fintsTransactions = ref<FinTSTransaction[]>([]);

// Converter composable
const converter = useConverter();

// Snackbar
const { showSnackbar } = useSnackbar();

// Step 2 state
const showHelpDialog = ref(false);
const configFileInput = ref<HTMLInputElement | null>(null);
const fullConfigFileInput = ref<HTMLInputElement | null>(null);
const swimlanesContainer = ref<InstanceType<typeof draggable> | null>(null);

// Step 3 state
const exportFilename = ref('fints-export');

// Generate default import tag with timestamp
function getDefaultImportTag() {
  const now = new Date();
  const date = now.toLocaleDateString('en-CA'); // YYYY-MM-DD format
  const time = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); // HH:MM format
  return t('views.fints.defaultImportTag', { date, time });
}

const importOptions = reactive({
  tags: getDefaultImportTag(),
  applyRules: true,
  errorIfDuplicate: true,
});
const importing = ref(false);

// CSV export options
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
  { title: t('views.fints.csvOptions.whenNeeded'), value: 'needed' },
  { title: t('common.csvOptions.always'), value: 'always' },
  { title: t('common.csvOptions.never'), value: 'never' },
]);

const lineEndingOptions = computed(() => [
  { title: t('views.fints.csvOptions.lfUnix'), value: 'lf' },
  { title: t('views.fints.csvOptions.crlfWindows'), value: 'crlf' },
]);
const importValidation = ref<ImportValidation | null>(null);
const showImportDialog = ref(false);
const showImportResultsDialog = ref(false);
const importResults = ref<{ successful: number; failed: number; errors: string[] } | null>(null);

// Progress
const progress = useProgress('Initializing...');

// FinTS transaction columns (source columns for mapping)
const FINTS_COLUMNS = [
  'bookingDate',
  'valueDate',
  'amount',
  'currency',
  'counterpartyName',
  'counterpartyIban',
  'counterpartyBic',
  'purpose',
  'transactionType',
  'endToEndReference',
  'mandateReference',
  'creditorId',
  'bookingText',
  'reference',
];

// Convert FinTS transactions to CSV-like structure for the converter
function updateConverterData() {
  if (fintsTransactions.value.length === 0) {
    converter.parsedCSV.value = null;
    return;
  }

  // Create a CSV-like structure from FinTS transactions
  const headers = FINTS_COLUMNS;
  const rows = fintsTransactions.value.map((tx) => [
    tx.bookingDate,
    tx.valueDate,
    String(tx.amount),
    tx.currency,
    tx.counterpartyName || '',
    tx.counterpartyIban || '',
    tx.counterpartyBic || '',
    tx.purpose || '',
    tx.transactionType || '',
    tx.endToEndReference || '',
    tx.mandateReference || '',
    tx.creditorId || '',
    tx.bookingText || '',
    tx.reference || '',
  ]);

  converter.parsedCSV.value = {
    headers,
    rows,
    rawContent: '',
  };
}

// Watch for transaction changes
watch(fintsTransactions, updateConverterData);

// Computed
const canConnect = computed(() => {
  return (
    bankConfig.bankCode &&
    bankConfig.url &&
    bankConfig.userId &&
    bankConfig.pin &&
    !connecting.value
  );
});

const selectedAccount = computed<FinTSAccount | null>(() => {
  if (!dialogState.value?.accounts) return null;
  return dialogState.value.accounts[selectedAccountIndex.value] || null;
});

const accountOptions = computed(() => {
  if (!dialogState.value?.accounts) return [];
  return dialogState.value.accounts.map((acc, idx) => ({
    value: idx,
    label: `${acc.ownerName || t('common.labels.account')} - ${acc.iban || acc.accountNumber}`,
  }));
});

const canFetch = computed(() => {
  return dialogState.value && selectedAccount.value && startDate.value && endDate.value;
});

const canProceed = computed((): boolean => {
  switch (currentStep.value) {
    case 1:
      return fintsTransactions.value.length > 0;
    case 2:
      return converter.config.value.swimlanes.some((s) => s.enabled);
    default:
      return true;
  }
});

const stepLoading = computed(() => {
  return currentStep.value === 1 && (connecting.value || fetching.value);
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
    if (fintsTransactions.value.length > 0) {
      return t('common.labels.countTransactionsLoaded', { count: fintsTransactions.value.length });
    }
    if (dialogState.value) {
      return t('views.fints.connectedAccounts', { count: dialogState.value.accounts?.length || 0 });
    }
    return '';
  }
  if (currentStep.value === 2) {
    const enabled = converter.config.value.swimlanes.filter((s) => s.enabled).length;
    return t('views.fints.columnsConfigured', { count: enabled });
  }
  if (currentStep.value === 3) {
    if (importValidation.value?.valid) {
      return t('views.fints.readyToImportStatus', {
        count: importValidation.value.summary.validRows,
      });
    }
  }
  return '';
});

const statusColor = computed(() => {
  if (currentStep.value === 1) {
    return fintsTransactions.value.length > 0 ? 'success' : dialogState.value ? 'info' : '';
  }
  if (currentStep.value === 2) {
    return converter.config.value.swimlanes.some((s) => s.enabled) ? 'success' : '';
  }
  if (currentStep.value === 3) {
    return importValidation.value?.valid ? 'success' : '';
  }
  return '';
});

const isDecoupledTan = computed(() => {
  if (tanRequest.value?.tanProcess === 'decoupled') return true;
  const selectedMethod = availableTanMethods.value.find((m) => m.id === selectedTanMethodId.value);
  return selectedMethod?.isDecoupled ?? false;
});

// Preview table data (Step 1)
const previewHeaders = computed(() =>
  FINTS_COLUMNS.map((col) => col.replace(/([A-Z])/g, ' $1').trim())
);
const previewRows = computed(() => {
  if (!converter.parsedCSV.value) return [];
  return converter.parsedCSV.value.rows.slice(0, 10);
});

// Source columns for swimlane mapping
const sourceColumns = computed(() => FINTS_COLUMNS);

// Available Firefly columns to add
const availableColumns = computed(() => {
  const usedColumns = new Set(converter.config.value.swimlanes.map((s) => s.targetColumn));
  return FIREFLY_COLUMNS.filter((col) => !usedColumns.has(col.id));
});

// Enabled column count for step 3
const enabledColumnCount = computed(
  () => converter.config.value.swimlanes.filter((s) => s.enabled).length
);

import type { TransformBlock, SwimlaneError } from '@shared/types/converter';

// Fetch known banks on mount
async function fetchKnownBanks() {
  try {
    const response = await api.get('/fints/banks');
    knownBanks.value = response.data.data;
  } catch (error) {
    console.error('Failed to fetch known banks:', error);
  }
}
fetchKnownBanks();

// Bank selection handler
function onBankSelected(bank: KnownBank | null) {
  if (bank) {
    bankConfig.bankCode = bank.blz;
    bankConfig.url = bank.url;
  }
}

// Connect to bank
async function connect() {
  connecting.value = true;

  try {
    const response = await api.post('/fints/connect', {
      bankCode: bankConfig.bankCode,
      url: bankConfig.url,
      userId: bankConfig.userId,
      pin: bankConfig.pin,
    });

    const state = response.data.data as FinTSDialogState;
    dialogState.value = state;

    if (state.tanRequired && state.tanRequest) {
      tanRequest.value = state.tanRequest;
      if (state.tanMethods && state.tanMethods.length > 0) {
        availableTanMethods.value = state.tanMethods;
        selectedTanMethodId.value = state.selectedTanMethod || state.tanMethods[0].id;
      }
      showTanDialog.value = true;
      if (state.tanRequest.tanProcess === 'decoupled') {
        startPolling();
      }
    } else {
      showSnackbar(t('views.fints.messages.connectedSuccessfully'), 'success');
    }
  } catch (error) {
    showSnackbar(
      error instanceof Error ? error.message : t('views.fints.messages.failedToConnect'),
      'error'
    );
  } finally {
    connecting.value = false;
  }
}

// Submit TAN
async function submitTan() {
  if (!tanInput.value) return;
  submittingTan.value = true;

  try {
    const response = await api.post('/fints/submit-tan', { tan: tanInput.value });
    dialogState.value = response.data.data as FinTSDialogState;
    showTanDialog.value = false;
    tanInput.value = '';
    tanRequest.value = null;
    showSnackbar(t('views.fints.messages.tanVerified'), 'success');
  } catch (error) {
    showSnackbar(
      error instanceof Error ? error.message : t('views.fints.messages.failedToVerifyTan'),
      'error'
    );
  } finally {
    submittingTan.value = false;
  }
}

// Cancel TAN
function cancelTan() {
  stopPolling();
  showTanDialog.value = false;
  tanInput.value = '';
  tanRequest.value = null;
  availableTanMethods.value = [];
  selectedTanMethodId.value = '';
  disconnect();
}

// Stop TAN polling
function stopPolling() {
  if (pollingInterval.value) {
    clearInterval(pollingInterval.value);
    pollingInterval.value = null;
  }
  pollingTan.value = false;
}

// Start polling for decoupled TAN confirmation
function startPolling() {
  if (pollingTan.value) return;
  pollingTan.value = true;
  pollingInterval.value = setInterval(pollTanStatus, 2000);
  pollTanStatus();
}

// Poll the bank for TAN status
async function pollTanStatus() {
  try {
    const response = await api.post('/fints/poll-tan', {
      orderRef: tanRequest.value?.orderRef,
    });
    const state = response.data.data as FinTSDialogState;

    if (!state.tanRequired) {
      stopPolling();
      dialogState.value = state;
      showTanDialog.value = false;
      tanInput.value = '';
      tanRequest.value = null;
      availableTanMethods.value = [];
      selectedTanMethodId.value = '';
      showSnackbar(t('views.fints.messages.authenticationConfirmed'), 'success');
    } else if (state.tanRequest?.challengeText !== tanRequest.value?.challengeText) {
      tanRequest.value = state.tanRequest || null;
    }
  } catch (error) {
    console.error('Poll error:', error);
  }
}

// Disconnect
async function disconnect() {
  try {
    await api.post('/fints/disconnect');
  } catch {
    // Ignore errors
  }
  dialogState.value = null;
  selectedAccountIndex.value = 0;
  fintsTransactions.value = [];
}

// Fetch transactions from bank
async function fetchTransactions() {
  if (!selectedAccount.value || !startDate.value || !endDate.value) {
    showSnackbar(t('views.fints.messages.selectAccountAndDate'), 'warning');
    return;
  }

  fetching.value = true;
  fintsTransactions.value = [];
  progress.reset();
  progress.message.value = t('views.fints.messages.fetchingTransactions');

  try {
    const response = await api.post(
      '/fints/fetch',
      {
        account: selectedAccount.value,
        startDate: startDate.value,
        endDate: endDate.value,
      },
      { withCredentials: true }
    );

    fintsTransactions.value = response.data.data.transactions || [];

    if (fintsTransactions.value.length > 0) {
      showSnackbar(
        t('views.fints.messages.loadedTransactions', { count: fintsTransactions.value.length }),
        'success'
      );
    } else {
      showSnackbar(t('views.fints.messages.noTransactionsInRange'), 'info');
    }
  } catch (error) {
    showSnackbar(
      error instanceof Error ? error.message : t('views.fints.messages.failedToFetch'),
      'error'
    );
  } finally {
    fetching.value = false;
  }
}

// Get swimlane preview value for step 2
function getSwimlanePreviewValue(swimlaneId: string): string {
  if (!converter.parsedCSV.value || converter.parsedCSV.value.rows.length === 0) {
    return '';
  }

  const swimlane = converter.config.value.swimlanes.find((s) => s.id === swimlaneId);
  if (!swimlane || !swimlane.enabled) return '';

  try {
    const transformed = converter.getTransformedData();
    if (transformed.length === 0) return '';
    const firstRow = transformed[0];
    return String(firstRow[swimlane.targetColumn as keyof typeof firstRow] || '');
  } catch {
    return '';
  }
}

// Get swimlane error for step 2
function getSwimlaneError(swimlaneId: string): SwimlaneError | undefined {
  if (!converter.preview.value) return undefined;
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

// Save full config (including bank settings)
function onSaveConfig() {
  const converterConfig = JSON.parse(converter.saveConfig());
  const fullConfig = {
    version: '1.0',
    bank: {
      bankCode: bankConfig.bankCode,
      url: bankConfig.url,
      userId: bankConfig.userId,
      // PIN is intentionally NOT saved for security
    },
    accountIndex: selectedAccountIndex.value,
    dateRange: {
      startDate: startDate.value,
      endDate: endDate.value,
    },
    converter: converterConfig,
  };
  const json = JSON.stringify(fullConfig, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'fints-config.json';
  a.click();
  URL.revokeObjectURL(url);
}

// Load config (Stage 2 - converter only)
function onLoadConfig() {
  configFileInput.value?.click();
}

function onConfigFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const json = e.target?.result as string;
      const parsed = JSON.parse(json);
      // Check if this is a full config or just converter config
      if (parsed.converter) {
        // Full config - only load converter part
        converter.loadConfig(JSON.stringify(parsed.converter));
      } else {
        // Just converter config
        converter.loadConfig(json);
      }
      showSnackbar(t('views.fints.messages.configLoaded'), 'success');
    } catch {
      showSnackbar(t('views.fints.messages.failedToLoadConfig'), 'error');
    }
  };
  reader.readAsText(file);
  input.value = '';
}

// Load full config (Stage 1 - bank settings + converter)
function onLoadFullConfig() {
  fullConfigFileInput.value?.click();
}

function onFullConfigFileSelected(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const json = e.target?.result as string;
      const config = JSON.parse(json);

      // Load bank settings
      if (config.bank) {
        bankConfig.bankCode = config.bank.bankCode || '';
        bankConfig.url = config.bank.url || '';
        bankConfig.userId = config.bank.userId || '';
        // PIN is intentionally NOT loaded - user must enter it

        // Try to find matching bank in knownBanks
        const matchingBank = knownBanks.value.find((b) => b.blz === config.bank.bankCode);
        if (matchingBank) {
          selectedBank.value = matchingBank;
        }
      }

      // Load account index (will be applied after connecting)
      if (typeof config.accountIndex === 'number') {
        selectedAccountIndex.value = config.accountIndex;
      }

      // Load date range
      if (config.dateRange) {
        if (config.dateRange.startDate) startDate.value = config.dateRange.startDate;
        if (config.dateRange.endDate) endDate.value = config.dateRange.endDate;
      }

      // Load converter config
      if (config.converter) {
        converter.loadConfig(JSON.stringify(config.converter));
      }

      showSnackbar(t('views.fints.messages.configLoadedEnterPin'), 'success');
    } catch (err) {
      console.error('Failed to load config:', err);
      showSnackbar(t('views.fints.messages.failedToLoadConfig'), 'error');
    }
  };
  reader.readAsText(file);
  input.value = '';
}

// Download CSV
function onDownloadCSV() {
  const csv = converter.exportCSV();
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${exportFilename.value}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Import to Firefly
async function onImportToFirefly() {
  importing.value = true;

  try {
    const result = await converter.importToFirefly({
      tags: importOptions.tags,
      applyRules: importOptions.applyRules,
      errorIfDuplicate: importOptions.errorIfDuplicate,
    });

    showImportDialog.value = false;
    importResults.value = result;
    showImportResultsDialog.value = true;
  } catch (error) {
    showImportDialog.value = false;
    showSnackbar(
      error instanceof Error ? error.message : t('views.fints.messages.failedToFetch'),
      'error'
    );
  } finally {
    importing.value = false;
  }
}

// Step navigation
function onStepNext(step: number) {
  if (step === 2) {
    // Initialize swimlanes with default FinTS mapping if empty
    if (converter.config.value.swimlanes.length === 0) {
      setupDefaultSwimlanes();
    }
  }
  if (step === 3) {
    converter.generatePreview(20);
    importValidation.value = converter.validateForImport();
  }
}

// Setup default swimlanes for FinTS data
function setupDefaultSwimlanes() {
  // Add commonly needed columns with sensible defaults
  converter.addSwimlane('date');
  converter.addSwimlane('amount');
  converter.addSwimlane('description');
  converter.addSwimlane('type');
  converter.addSwimlane('destination_name');
  converter.addSwimlane('source_name');

  // Set up default blocks for each
  const swimlanes = converter.config.value.swimlanes;

  // Date: use bookingDate
  const dateSwimlane = swimlanes.find((s) => s.targetColumn === 'date');
  if (dateSwimlane) {
    converter.updateSwimlaneBlocks(dateSwimlane.id, [
      { id: crypto.randomUUID(), type: 'column', sourceColumn: 'bookingDate' },
    ]);
  }

  // Amount: use amount column with absolute value
  const amountSwimlane = swimlanes.find((s) => s.targetColumn === 'amount');
  if (amountSwimlane) {
    converter.updateSwimlaneBlocks(amountSwimlane.id, [
      { id: crypto.randomUUID(), type: 'column', sourceColumn: 'amount' },
      {
        id: crypto.randomUUID(),
        type: 'numberFormat',
        inputDecimalSeparator: '.',
        inputThousandsSeparator: '',
        outputDecimalSeparator: '.',
        outputThousandsSeparator: '',
        decimals: 2,
        absolute: true,
      },
    ]);
  }

  // Description: use purpose
  const descSwimlane = swimlanes.find((s) => s.targetColumn === 'description');
  if (descSwimlane) {
    converter.updateSwimlaneBlocks(descSwimlane.id, [
      { id: crypto.randomUUID(), type: 'column', sourceColumn: 'purpose' },
    ]);
  }

  // Type: conditional based on amount sign (use switchCase for simpler logic)
  const typeSwimlane = swimlanes.find((s) => s.targetColumn === 'type');
  if (typeSwimlane) {
    converter.updateSwimlaneBlocks(typeSwimlane.id, [
      {
        id: crypto.randomUUID(),
        type: 'switchCase',
        useCurrentValue: false,
        column: 'amount',
        cases: [
          {
            operator: 'lessThan',
            value: '0',
            blocks: [{ id: crypto.randomUUID(), type: 'static', value: 'withdrawal' }],
          },
        ],
        defaultBlocks: [{ id: crypto.randomUUID(), type: 'static', value: 'deposit' }],
      },
    ]);
  }

  // Destination: counterparty for withdrawals
  const destSwimlane = swimlanes.find((s) => s.targetColumn === 'destination_name');
  if (destSwimlane) {
    converter.updateSwimlaneBlocks(destSwimlane.id, [
      {
        id: crypto.randomUUID(),
        type: 'switchCase',
        useCurrentValue: false,
        column: 'amount',
        cases: [
          {
            operator: 'lessThan',
            value: '0',
            blocks: [{ id: crypto.randomUUID(), type: 'column', sourceColumn: 'counterpartyName' }],
          },
        ],
        defaultBlocks: [{ id: crypto.randomUUID(), type: 'static', value: '' }],
      },
    ]);
  }

  // Source: counterparty for deposits
  const sourceSwimlane = swimlanes.find((s) => s.targetColumn === 'source_name');
  if (sourceSwimlane) {
    converter.updateSwimlaneBlocks(sourceSwimlane.id, [
      {
        id: crypto.randomUUID(),
        type: 'switchCase',
        useCurrentValue: false,
        column: 'amount',
        cases: [
          {
            operator: 'greaterThan',
            value: '0',
            blocks: [{ id: crypto.randomUUID(), type: 'column', sourceColumn: 'counterpartyName' }],
          },
        ],
        defaultBlocks: [{ id: crypto.randomUUID(), type: 'static', value: '' }],
      },
    ]);
  }
}

// Reset wizard
async function onReset() {
  stopPolling();
  await disconnect();

  currentStep.value = 1;
  selectedBank.value = null;
  bankConfig.bankCode = '';
  bankConfig.url = '';
  bankConfig.userId = '';
  bankConfig.pin = '';
  dialogState.value = null;
  selectedAccountIndex.value = 0;
  tanRequest.value = null;
  availableTanMethods.value = [];
  selectedTanMethodId.value = '';
  fintsTransactions.value = [];
  converter.reset();
  progress.reset();
  importValidation.value = null;
}

// Handle page unload (refresh/close) - disconnect from bank
function handleBeforeUnload() {
  if (dialogState.value) {
    // Use sendBeacon for reliable delivery during page unload
    navigator.sendBeacon('/api/fints/disconnect');
  }
}

// Register beforeunload listener on mount
onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload);
});

// Cleanup on unmount (covers component destruction within Vue)
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload);
  stopPolling();
  // Disconnect if still connected
  if (dialogState.value) {
    navigator.sendBeacon('/api/fints/disconnect');
  }
});

// Handle route navigation away from this view
onBeforeRouteLeave((_to, _from, next) => {
  if (dialogState.value) {
    // Fire disconnect and continue navigation
    disconnect();
  }
  next();
});
</script>

<style scoped>
.tool-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
}

.step-1-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  overflow: hidden;
}

.step-3-content {
  display: grid;
  grid-template-rows: 1fr auto;
  height: 100%;
  gap: 16px;
}

.preview-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.preview-card > .v-card-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.data-preview-card {
  flex: 1;
  min-height: 300px;
}

.preview-table-container {
  flex: 1;
  overflow: auto;
  min-height: 0;
}

.preview-table {
  width: max-content;
  min-width: 100%;
}

.preview-table th,
.preview-table td {
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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

.swimlanes-container::-webkit-scrollbar {
  height: 8px;
}

.swimlanes-container::-webkit-scrollbar-track {
  background: rgba(var(--v-theme-surface-variant), 0.3);
  border-radius: 4px;
}

.swimlanes-container::-webkit-scrollbar-thumb {
  background: rgba(var(--v-theme-primary), 0.5);
  border-radius: 4px;
}

.swimlanes-container::-webkit-scrollbar-thumb:hover {
  background: rgba(var(--v-theme-primary), 0.7);
}
</style>

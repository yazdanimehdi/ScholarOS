<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any -- form models are user data of any shape */
import ImagePicker from './ImagePicker.vue';
import ListInput from './ListInput.vue';
import MarkdownEditor from './MarkdownEditor.vue';
import { getIn, optionOf, replaceAt, setIn, type FieldDef, type Option } from './fields';
import { bibtexFor, type BibSource } from '../lib/bibtex';
import { isOwner } from '../lib/editorial';

const props = defineProps<{
  fields: FieldDef[];
  model: Record<string, any>;
  errors?: Record<string, string>;
  prefix?: string;
  owner?: string;
}>();

const labelId = (key: string) => `f-${props.prefix ?? ''}${key}`.replace(/[^\w-]/g, '-');
const error = (key: string) => props.errors?.[`${props.prefix ?? ''}${key}`];
const errorId = (key: string) => `${labelId(key)}-error`;
/** Links an input to its error message. */
const invalid = (key: string) => (error(key) ? { 'aria-invalid': 'true', 'aria-describedby': errorId(key) } : {});
const value = (key: string) => getIn(props.model, key);
const set = (key: string, v: unknown) => setIn(props.model, key, v);
const text = (e: Event) => (e.target as HTMLInputElement).value;
const strings = (key: string): string[] => (Array.isArray(value(key)) ? value(key) : []);
const chosen = (e: Event) => [...(e.target as HTMLSelectElement).selectedOptions].map((o) => o.value);
const options = (f: FieldDef): Option[] => (f.options ?? []).map(optionOf);
/** Current values missing from the options (e.g. a renamed research area): still shown, so a save keeps them. */
const unlisted = (f: FieldDef, values: unknown[]) =>
  values
    .filter((v) => v != null && v !== '')
    .map(String)
    .filter((v) => !options(f).some((o) => o.value === v));
const regenerate = (key: string) => set(key, bibtexFor({ ...(props.model as BibSource), bibtex: undefined }));
</script>

<template>
  <div class="adm-form">
    <template v-for="f in fields" :key="f.key">
      <label v-if="f.type === 'checkbox'" class="adm-check">
        <input
          type="checkbox"
          :checked="value(f.key) ?? f.default ?? false"
          @change="set(f.key, ($event.target as HTMLInputElement).checked)"
        />
        {{ f.label }}
      </label>

      <fieldset v-else-if="f.type === 'objects'" class="adm-group">
        <legend>{{ f.label }}</legend>
        <ListInput
          :items="value(f.key) ?? []"
          :blank="() => ({})"
          :fixed="f.fixed"
          add-label="Add item"
          @update="set(f.key, $event)"
        >
          <template #default="{ item, index }">
            <FormFields
              :fields="f.fields ?? []"
              :model="item as Record<string, any>"
              :errors="errors"
              :prefix="`${prefix ?? ''}${f.key}.${index}.`"
              :owner="owner"
            />
          </template>
        </ListInput>
      </fieldset>

      <div
        v-else-if="['list', 'authors', 'image', 'markdown'].includes(f.type)"
        class="adm-field"
        role="group"
        :aria-labelledby="labelId(f.key)"
        v-bind="invalid(f.key)"
      >
        <span :id="labelId(f.key)">{{ f.label }}</span>
        <ListInput
          v-if="f.type === 'list' || f.type === 'authors'"
          :items="strings(f.key)"
          :blank="() => ''"
          @update="set(f.key, $event)"
        >
          <template #default="{ item, index }">
            <input
              type="text"
              :value="item"
              :class="{ 'adm-owner': f.type === 'authors' && !!owner && isOwner(String(item), owner) }"
              :aria-label="`${f.label} ${index + 1}`"
              @input="set(f.key, replaceAt(strings(f.key), index, text($event)))"
            />
          </template>
        </ListInput>
        <ImagePicker
          v-else-if="f.type === 'image'"
          :model-value="value(f.key)"
          :folder="f.folder ?? 'content'"
          :label="f.label"
          @update:model-value="set(f.key, $event)"
        />
        <MarkdownEditor v-else :model-value="value(f.key) ?? ''" compact @update:model-value="set(f.key, $event)" />
        <small v-if="f.hint">{{ f.hint }}</small>
        <span v-if="error(f.key)" :id="errorId(f.key)" class="adm-err">{{ error(f.key) }}</span>
      </div>

      <div v-else-if="f.type === 'color'" class="adm-field">
        <div class="adm-list-row adm-color-row">
          <label class="adm-field">
            <span>{{ f.label }}</span>
            <input type="text" :value="value(f.key) ?? ''" v-bind="invalid(f.key)" @input="set(f.key, text($event))" />
          </label>
          <input
            type="color"
            :value="value(f.key) || '#1f3c88'"
            :aria-label="`${f.label} picker`"
            @input="set(f.key, text($event))"
          />
        </div>
        <small v-if="f.hint">{{ f.hint }}</small>
        <span v-if="error(f.key)" :id="errorId(f.key)" class="adm-err">{{ error(f.key) }}</span>
      </div>

      <label v-else class="adm-field">
        <span>{{ f.label }}</span>
        <textarea
          v-if="f.type === 'textarea' || f.type === 'bibtex'"
          :value="value(f.key) ?? ''"
          :rows="f.type === 'bibtex' ? 8 : 3"
          v-bind="invalid(f.key)"
          @input="set(f.key, text($event))"
        />
        <input
          v-else-if="f.type === 'number'"
          type="number"
          :value="value(f.key) ?? ''"
          v-bind="invalid(f.key)"
          @input="set(f.key, text($event) === '' ? undefined : Number(text($event)))"
        />
        <input
          v-else-if="f.type === 'date'"
          type="date"
          :value="String(value(f.key) ?? '').slice(0, 10)"
          v-bind="invalid(f.key)"
          @input="set(f.key, text($event))"
        />
        <select
          v-else-if="f.type === 'select'"
          :value="value(f.key) ?? ''"
          v-bind="invalid(f.key)"
          @change="set(f.key, text($event))"
        >
          <option value="">—</option>
          <option v-for="o in options(f)" :key="o.value" :value="o.value">{{ o.label }}</option>
          <option v-for="v in unlisted(f, [value(f.key)])" :key="v" :value="v">{{ v }} (not in list)</option>
        </select>
        <select
          v-else-if="f.type === 'pubs'"
          multiple
          size="6"
          v-bind="invalid(f.key)"
          @change="set(f.key, chosen($event))"
        >
          <option v-for="o in options(f)" :key="o.value" :value="o.value" :selected="strings(f.key).includes(o.value)">
            {{ o.label }}
          </option>
          <option v-for="v in unlisted(f, strings(f.key))" :key="v" :value="v" selected>{{ v }} (not in list)</option>
        </select>
        <output v-else-if="f.type === 'readonly'">{{ value(f.key) }}</output>
        <input
          v-else
          type="text"
          :value="value(f.key) ?? ''"
          v-bind="invalid(f.key)"
          @input="set(f.key, text($event))"
        />
        <small v-if="f.hint">{{ f.hint }}</small>
        <span v-if="error(f.key)" :id="errorId(f.key)" class="adm-err">{{ error(f.key) }}</span>
      </label>
      <button v-if="f.type === 'bibtex'" type="button" class="adm-btn adm-btn-small adm-add" @click="regenerate(f.key)">
        Regenerate
      </button>
    </template>
  </div>
</template>

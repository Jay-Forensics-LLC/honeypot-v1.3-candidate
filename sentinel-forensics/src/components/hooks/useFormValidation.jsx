import { useState } from 'react';

/**
 * Form validation hook with user-friendly error messages
 * @param {Object} initialValues - Initial form values
 * @param {Object} validationRules - Validation rules for each field
 * @returns {Object} Form state and handlers
 */
export function useFormValidation(initialValues = {}, validationRules = {}) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validation functions
  const validators = {
    required: (value, message = 'This field is required') => {
      if (!value || (typeof value === 'string' && !value.trim())) {
        return message;
      }
      return true;
    },

    email: (value, message = 'Please enter a valid email address') => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (value && !emailRegex.test(value)) {
        return message;
      }
      return true;
    },

    minLength: (min, message) => (value) => {
      if (value && value.length < min) {
        return message || `Must be at least ${min} characters`;
      }
      return true;
    },

    maxLength: (max, message) => (value) => {
      if (value && value.length > max) {
        return message || `Must be no more than ${max} characters`;
      }
      return true;
    },

    pattern: (regex, message = 'Invalid format') => (value) => {
      if (value && !regex.test(value)) {
        return message;
      }
      return true;
    },

    custom: (validatorFn) => validatorFn
  };

  // Validate single field
  const validateField = (name, value) => {
    const rules = validationRules[name];
    if (!rules) return true;

    for (const rule of rules) {
      const result = rule(value);
      if (result !== true) {
        return result;
      }
    }
    return true;
  };

  // Validate all fields
  const validateForm = () => {
    const newErrors = {};
    let isValid = true;

    Object.keys(validationRules).forEach((name) => {
      const error = validateField(name, values[name]);
      if (error !== true) {
        newErrors[name] = error;
        isValid = false;
      }
    });

    setErrors(newErrors);
    return isValid;
  };

  // Handle input change
  const handleChange = (name) => (e) => {
    const value = e.target ? e.target.value : e;
    setValues((prev) => ({ ...prev, [name]: value }));

    // Validate on change if field was touched
    if (touched[name]) {
      const error = validateField(name, value);
      setErrors((prev) => ({
        ...prev,
        [name]: error === true ? undefined : error
      }));
    }
  };

  // Handle input blur
  const handleBlur = (name) => () => {
    setTouched((prev) => ({ ...prev, [name]: true }));
    const error = validateField(name, values[name]);
    setErrors((prev) => ({
      ...prev,
      [name]: error === true ? undefined : error
    }));
  };

  // Handle form submit
  const handleSubmit = (onSubmit) => async (e) => {
    e?.preventDefault();

    // Mark all fields as touched
    const allTouched = Object.keys(validationRules).reduce((acc, key) => {
      acc[key] = true;
      return acc;
    }, {});
    setTouched(allTouched);

    // Validate form
    const isValid = validateForm();
    if (!isValid) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(values);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Reset form
  const reset = () => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
    setIsSubmitting(false);
  };

  return {
    values,
    errors,
    touched,
    isSubmitting,
    handleChange,
    handleBlur,
    handleSubmit,
    reset,
    setValues,
    setErrors,
    validators,
    validateForm
  };
}
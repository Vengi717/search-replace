import {
    HintPreferences,
    SavedInstances,
    SavedSearchReplaceInstance,
    SearchReplaceBackgroundMessage,
    SearchReplaceInstance,
    SearchReplacePopupStorage,
    SearchReplaceStorageItems,
} from '../types'
import { getInstanceId } from '../util'

async function saveStorage(
    instance: SearchReplaceInstance,
    history: SearchReplaceInstance[],
    savedInstances: SavedInstances,
    hintPreferences?: HintPreferences
) {
    // always store the instance and history
    const newStorage: SearchReplacePopupStorage = {
        storage: {
            instance,
            history,
            saved: savedInstances,
            hintPreferences,
        },
    }
    await chrome.storage.local.set(newStorage)
}

function combineHistory(messageStorage: SearchReplaceStorageItems | undefined, storage: SearchReplaceStorageItems) {
    return messageStorage
        ? messageStorage.history && messageStorage.history.length
            ? messageStorage.history
            : storage.history
        : storage.history
}

export async function setupStorage(msg: SearchReplaceBackgroundMessage) {
    // Get the various stored values
    const { storage } = (await chrome.storage.local.get(['storage'])) as SearchReplacePopupStorage
    //console.log('BACKGROUND: saved storage is', storage)
    const instance: SearchReplaceInstance = msg.storage ? msg.storage.instance : storage.instance
    //console.log('BACKGROUND: instance is: ', instance)
    // Allows the edit rules page to not have to send back history
    const history: SearchReplaceInstance[] = combineHistory(msg.storage, storage)
    //console.log('BACKGROUND: history is: ', history)
    const url = msg.url
    const savedInstances: SavedInstances = storage.saved || {}
    const hintPreferences = { ...(storage.hintPreferences || {}), ...(msg.storage?.hintPreferences || {}) }
    //console.log('BACKGROUND: SavedInstances is: ', savedInstances)
    return { instance, history, url, savedInstances, storage, hintPreferences }
}

export async function listenerAdmin(msg: SearchReplaceBackgroundMessage, port: chrome.runtime.Port) {
    if (msg.action) {
        const storage = await setupStorage(msg)
        const { instance, history, url, hintPreferences } = storage
        const savedInstances = storage.savedInstances

        if (msg.action === 'recover') {
            // Recovering search terms from the storage to display in the popup
            port.postMessage(storage as SearchReplaceStorageItems)
            // Remove any saved searches from last popup open
            // We do not want to save anything when recovering storage
            return
        } else if (msg.action === 'clearHistory') {
            // Clearing the history in the popup
            await saveStorage(instance, [], savedInstances)
        } else if (msg.action === 'save' && instance.options.save && url) {
            console.log('save message received', msg)
            // Saving a SearchReplaceInstance for use on subsequent page loads
            const instanceId = msg['instanceId']
            const newInstance: SavedSearchReplaceInstance = {
                searchTerm: instance.searchTerm,
                replaceTerm: instance.replaceTerm,
                options: {
                    ...instance.options,
                    // Last historical searchReplace will give us the value of replaceAll - e.g. the button the user
                    // clicked on the popup
                    replaceAll: msg.storage ? msg.storage.history[0].options.replaceAll : false,
                },
                url,
            }
            const newInstanceId = getInstanceId(newInstance, true)
            savedInstances[newInstanceId] = newInstance
            if (instanceId && instanceId !== newInstanceId) {
                delete savedInstances[instanceId]
            }
            await saveStorage(instance, history, savedInstances)
        } else if (msg.action === 'delete') {
            // Deleting a saved SearchReplaceInstance
            const instanceId = msg['instanceId']
            if (instanceId) delete savedInstances[instanceId]
            await saveStorage(instance, history, savedInstances)
        } else if (msg.action === 'store') {
            // Store the instance and history in the storage
            await saveStorage(instance, history, savedInstances, hintPreferences)
        }
    }
}
